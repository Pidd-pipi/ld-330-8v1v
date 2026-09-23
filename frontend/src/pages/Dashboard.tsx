import { FileDoneOutlined, MedicineBoxOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Form, Input, Layout, List, Popover, Row, Select, Space, Table, Tag, Timeline, Typography, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import '@wangeditor/editor/dist/css/style.css';
import { createPrescription, fetchPrescriptions, fetchSummary, fetchTimeline, searchPatients, updatePrescriptionStatus } from '../api/emr';
import { APP_NAME, ROLE_OPTIONS } from '../constants/app';
import { MetricCard } from '../components/MetricCard';
import type { CreatePrescriptionPayload, MedicalRecord, Patient, Prescription, Summary } from '../types/emr';

const { Header, Content } = Layout;

const STATUS_COLORS: Record<string, string> = {
  待审核: 'gold',
  已审核: 'blue',
  已执行: 'green',
};

// 与后端流转顺序保持一致：待审核 → 已审核 → 已执行
const NEXT_STATUS: Record<string, string> = {
  待审核: '已审核',
  已审核: '已执行',
};

const ACTION_LABELS: Record<string, string> = {
  待审核: '审核通过',
  已审核: '执行',
};

const formatTime = (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm');

const showError = (error: unknown) => {
  const detail = axios.isAxiosError(error) ? error.response?.data?.message : null;
  message.error(Array.isArray(detail) ? detail.join('；') : detail ?? '操作失败，请重试');
};

export function Dashboard() {
  const [summary, setSummary] = useState<Summary>({ patientCount: 0, recordCount: 0, prescriptionCount: 0, workload: [] });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [timeline, setTimeline] = useState<MedicalRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [operator, setOperator] = useState('王医生');
  const [editorHtml, setEditorHtml] = useState('<p>主诉：发热伴咳嗽。诊疗计划：完善血常规检查。</p>');
  const [prescriptionForm] = Form.useForm<CreatePrescriptionPayload>();

  const selectPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedRecord(null);
    setPrescriptions([]);
    setTimeline(await fetchTimeline(patient.id));
  };

  const selectRecord = async (record: MedicalRecord) => {
    setSelectedRecord(record);
    prescriptionForm.resetFields();
    try {
      setPrescriptions(await fetchPrescriptions(record.id));
    } catch (error) {
      showError(error);
    }
  };

  const load = async () => {
    const [summaryData, patientData] = await Promise.all([fetchSummary(), searchPatients('')]);
    setSummary(summaryData);
    setPatients(patientData);
    if (patientData[0]) {
      await selectPatient(patientData[0]);
    }
  };

  const refreshPrescriptions = async (recordId: number) => {
    const [list, summaryData] = await Promise.all([fetchPrescriptions(recordId), fetchSummary()]);
    setPrescriptions(list);
    setSummary(summaryData);
  };

  const handleCreatePrescription = async (values: CreatePrescriptionPayload) => {
    if (!selectedRecord) {
      return;
    }
    try {
      const result = await createPrescription(selectedRecord.id, { ...values, operator });
      if (result.duplicated) {
        message.info(`「${result.drugName}」在该病历中已存在待审核/已审核处方，已返回已有处方`);
      } else {
        message.success(`处方已开具，当前状态：${result.status}`);
        prescriptionForm.resetFields();
      }
      await refreshPrescriptions(selectedRecord.id);
    } catch (error) {
      showError(error);
    }
  };

  const handleAdvanceStatus = async (prescription: Prescription) => {
    const next = NEXT_STATUS[prescription.status];
    if (!next) {
      return;
    }
    try {
      const updated = await updatePrescriptionStatus(prescription.id, next, operator);
      message.success(`「${updated.drugName}」已流转为${updated.status}`);
      await refreshPrescriptions(prescription.recordId);
    } catch (error) {
      showError(error);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <Layout className="app-shell">
      <Header className="topbar">
        <Typography.Title level={3}>{APP_NAME}</Typography.Title>
        <Space>
          <Select defaultValue="doctor" options={ROLE_OPTIONS} />
          <Tag color="blue">JWT + 角色权限演示</Tag>
        </Space>
      </Header>
      <Content className="content">
        <Alert
          type="info"
          showIcon
          message="演示数据已包含患者档案、结构化病历、审签状态与审计日志，前端通过 /api 由 Nginx 反向代理到后端。"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><MetricCard title="患者档案" value={summary.patientCount} icon={<TeamOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="病历数量" value={summary.recordCount} icon={<FileDoneOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="处方数量" value={summary.prescriptionCount} icon={<MedicineBoxOutlined />} /></Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="患者档案快速检索">
              <Form layout="inline" onFinish={(values) => searchPatients(values.keyword ?? '').then(setPatients)}>
                <Form.Item name="keyword"><Input.Search placeholder="姓名 / 身份证号 / 手机号" enterButton="检索" /></Form.Item>
              </Form>
              <Table
                rowKey="id"
                dataSource={patients}
                pagination={false}
                onRow={(record) => ({ onClick: () => void selectPatient(record) })}
                columns={[
                  { title: '档案编号', dataIndex: 'recordNo' },
                  { title: '姓名', dataIndex: 'name' },
                  { title: '性别', dataIndex: 'gender' },
                  { title: '年龄', dataIndex: 'age' },
                  { title: '过敏史', dataIndex: 'allergies' },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="病历时间轴与审签">
              <Timeline
                items={timeline.map((record) => ({
                  color: record.status === '已归档' ? 'green' : 'blue',
                  children: (
                    <Space direction="vertical">
                      <Space>
                        <strong>{record.department} · {record.recordType}</strong>
                        <Button
                          size="small"
                          type={selectedRecord?.id === record.id ? 'primary' : 'default'}
                          onClick={() => void selectRecord(record)}
                        >
                          开方
                        </Button>
                      </Space>
                      <span>{record.chiefComplaint}</span>
                      <Tag>{record.status}</Tag>
                    </Space>
                  ),
                }))}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="结构化病历模板与富文本书写">
              <Toolbar editor={null} defaultConfig={{}} mode="default" />
              <Editor defaultConfig={{ placeholder: '录入主诉、现病史、体格检查、诊断与治疗方案' }} value={editorHtml} onChange={(editor) => setEditorHtml(editor.getHtml())} mode="default" />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card
              title={selectedRecord ? `处方管理 · 病历 #${selectedRecord.id}（${selectedRecord.department}）` : '处方管理'}
              extra={
                <Space>
                  <span>操作人</span>
                  <Input size="small" style={{ width: 110 }} value={operator} onChange={(event) => setOperator(event.target.value)} />
                </Space>
              }
            >
              {!selectedRecord ? (
                <Alert type="warning" showIcon message="请先在「病历时间轴」中点击开方，选择一份病历后再开具处方。" />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {selectedPatient && selectedPatient.allergies && selectedPatient.allergies !== '无' && (
                    <Alert type="warning" showIcon message={`患者过敏史：${selectedPatient.allergies}，命中药品名将被拒绝开方`} />
                  )}
                  <Form form={prescriptionForm} layout="inline" onFinish={handleCreatePrescription}>
                    <Form.Item name="drugName" rules={[{ required: true, message: '请输入药品名称' }]}>
                      <Input placeholder="药品名称" />
                    </Form.Item>
                    <Form.Item name="specification" rules={[{ required: true, message: '请输入规格' }]}>
                      <Input placeholder="规格，如 0.25g*24粒" />
                    </Form.Item>
                    <Form.Item name="dosage" rules={[{ required: true, message: '请输入用量' }]}>
                      <Input placeholder="用量，如 0.5g" />
                    </Form.Item>
                    <Form.Item name="frequency" rules={[{ required: true, message: '请输入频次' }]}>
                      <Input placeholder="频次，如 tid" />
                    </Form.Item>
                    <Form.Item name="duration" rules={[{ required: true, message: '请输入疗程' }]}>
                      <Input placeholder="疗程，如 5天" />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit">开具处方</Button>
                    </Form.Item>
                  </Form>
                  <List
                    dataSource={prescriptions}
                    locale={{ emptyText: '该病历暂无处方' }}
                    renderItem={(item) => (
                      <List.Item
                        actions={[
                          NEXT_STATUS[item.status] ? (
                            <Button key="advance" size="small" type="primary" onClick={() => void handleAdvanceStatus(item)}>
                              {ACTION_LABELS[item.status]}
                            </Button>
                          ) : (
                            <Tag key="done" color="green">已完成</Tag>
                          ),
                          <Popover
                            key="logs"
                            title="流转记录"
                            content={
                              <List
                                size="small"
                                dataSource={item.logs}
                                renderItem={(log) => (
                                  <List.Item>
                                    {log.fromStatus ? `${log.fromStatus} → ` : ''}{log.toStatus} · {log.operator} · {formatTime(log.createdAt)}
                                  </List.Item>
                                )}
                              />
                            }
                          >
                            <Button size="small">流转记录</Button>
                          </Popover>,
                          <Button key="print" size="small">打印</Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              {item.drugName}
                              <Tag color={STATUS_COLORS[item.status]}>{item.status}</Tag>
                            </Space>
                          }
                          description={`${item.specification} · ${item.dosage} · ${item.frequency} · ${item.duration}｜最近操作：${item.updatedBy} ${formatTime(item.updatedAt)}`}
                        />
                      </List.Item>
                    )}
                  />
                </Space>
              )}
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
