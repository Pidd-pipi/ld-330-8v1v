import { FileDoneOutlined, MedicineBoxOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Form, Input, Layout, List, message, Row, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import '@wangeditor/editor/dist/css/style.css';
import {
  createPrescription,
  fetchPrescriptions,
  fetchSummary,
  fetchTimeline,
  searchPatients,
  updatePrescriptionStatus,
} from '../api/emr';
import { APP_NAME, ROLE_OPTIONS } from '../constants/app';
import { MetricCard } from '../components/MetricCard';
import type { MedicalRecord, Patient, Prescription, Summary } from '../types/emr';

const { Header, Content } = Layout;

const STATUS_COLORS: Record<string, string> = {
  待审核: 'gold',
  已审核: 'blue',
  已执行: 'green',
};

const NEXT_STATUS: Record<string, { target: string; action: string }> = {
  待审核: { target: '已审核', action: '审核' },
  已审核: { target: '已执行', action: '执行' },
};

const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });

const extractError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.message;
    if (Array.isArray(detail)) return detail.join('；');
    if (typeof detail === 'string') return detail;
  }
  return '操作失败，请稍后重试';
};

export function Dashboard() {
  const [summary, setSummary] = useState<Summary>({ patientCount: 0, recordCount: 0, prescriptionCount: 0, workload: [] });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [timeline, setTimeline] = useState<MedicalRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [operator, setOperator] = useState('王主任');
  const [submitting, setSubmitting] = useState(false);
  const [editorHtml, setEditorHtml] = useState('<p>主诉：发热伴咳嗽。诊疗计划：完善血常规检查。</p>');
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm();

  const load = async () => {
    const [summaryData, patientData] = await Promise.all([fetchSummary(), searchPatients('')]);
    setSummary(summaryData);
    setPatients(patientData);
    if (patientData[0]) {
      setTimeline(await fetchTimeline(patientData[0].id));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectRecord = async (record: MedicalRecord) => {
    setSelectedRecord(record);
    setPrescriptions(await fetchPrescriptions(record.id));
  };

  const reloadPrescriptions = async (recordId: number) => {
    setPrescriptions(await fetchPrescriptions(recordId));
  };

  const submitPrescription = async (values: { drugName: string; specification: string; dosage: string; frequency: string; duration: string }) => {
    if (!selectedRecord) return;
    setSubmitting(true);
    try {
      const result = await createPrescription(selectedRecord.id, { ...values, operator });
      if (result.duplicated) {
        messageApi.warning(`「${result.drugName}」在本病历下已存在${result.status}处方，已返回已有处方`);
      } else {
        messageApi.success('处方开具成功，状态：待审核');
      }
      form.resetFields();
      await reloadPrescriptions(selectedRecord.id);
      setSummary(await fetchSummary());
    } catch (error) {
      messageApi.error(extractError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const advanceStatus = async (prescription: Prescription) => {
    const next = NEXT_STATUS[prescription.status];
    if (!next) return;
    try {
      await updatePrescriptionStatus(prescription.id, next.target, operator);
      messageApi.success(`处方「${prescription.drugName}」已流转为「${next.target}」`);
      await reloadPrescriptions(prescription.recordId);
    } catch (error) {
      messageApi.error(extractError(error));
    }
  };

  return (
    <Layout className="app-shell">
      {contextHolder}
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
                onRow={(record) => ({ onClick: () => fetchTimeline(record.id).then(setTimeline) })}
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
                      <strong>{record.department} · {record.recordType}</strong>
                      <span>{record.chiefComplaint}</span>
                      <Space>
                        <Tag>{record.status}</Tag>
                        <Button
                          size="small"
                          type={selectedRecord?.id === record.id ? 'primary' : 'default'}
                          onClick={() => void selectRecord(record)}
                        >
                          开方 / 查看处方
                        </Button>
                      </Space>
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
              title={selectedRecord ? `处方管理（病历 #${selectedRecord.id} · ${selectedRecord.department}）` : '处方管理'}
              extra={
                <Space>
                  <span>操作人</span>
                  <Input size="small" style={{ width: 110 }} value={operator} onChange={(event) => setOperator(event.target.value)} />
                </Space>
              }
            >
              {!selectedRecord ? (
                <Empty description="请先在病历时间轴中选择一条病历" />
              ) : (
                <>
                  <Form form={form} layout="inline" onFinish={submitPrescription} style={{ rowGap: 8, marginBottom: 16 }}>
                    <Form.Item name="drugName" rules={[{ required: true, message: '请填写药品名称' }]}>
                      <Input placeholder="药品名称" style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item name="specification" rules={[{ required: true, message: '请填写规格' }]}>
                      <Input placeholder="规格，如 0.25g*24粒" style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item name="dosage" rules={[{ required: true, message: '请填写用量' }]}>
                      <Input placeholder="用量，如 0.5g" style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name="frequency" rules={[{ required: true, message: '请填写频次' }]}>
                      <Input placeholder="频次，如 tid" style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name="duration" rules={[{ required: true, message: '请填写疗程' }]}>
                      <Input placeholder="疗程，如 5天" style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" loading={submitting}>开具处方</Button>
                    </Form.Item>
                  </Form>
                  <List
                    dataSource={prescriptions}
                    locale={{ emptyText: '该病历暂无处方' }}
                    renderItem={(item) => (
                      <List.Item
                        actions={[
                          <Tag color={STATUS_COLORS[item.status]} key="status">{item.status}</Tag>,
                          NEXT_STATUS[item.status] ? (
                            <Button key="next" size="small" type="primary" onClick={() => void advanceStatus(item)}>
                              {NEXT_STATUS[item.status].action}
                            </Button>
                          ) : (
                            <Button key="done" size="small" disabled>已完成</Button>
                          ),
                          <Button key="print" size="small" onClick={() => window.print()}>打印</Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={`${item.drugName}（${item.specification}）`}
                          description={
                            <Space direction="vertical" size={2}>
                              <span>{item.dosage} · {item.frequency} · 疗程 {item.duration} · 开方人 {item.createdBy}</span>
                              {item.logs.map((log) => (
                                <span key={log.id} style={{ color: '#888', fontSize: 12 }}>
                                  {log.fromStatus ? `${log.fromStatus} → ${log.toStatus}` : `开具（${log.toStatus}）`}
                                  {' '}· {log.operator} · {formatTime(log.createdAt)}
                                </span>
                              ))}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </>
              )}
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
