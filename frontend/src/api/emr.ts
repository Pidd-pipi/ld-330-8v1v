import { apiClient } from './client';
import type { CreatePrescriptionPayload, MedicalRecord, Patient, Prescription, Summary } from '../types/emr';

export const fetchSummary = async () => {
  const { data } = await apiClient.get<Summary>('/summary');
  return data;
};

export const searchPatients = async (keyword: string) => {
  const { data } = await apiClient.get<Patient[]>('/patients', { params: { keyword } });
  return data;
};

export const fetchTimeline = async (patientId: number) => {
  const { data } = await apiClient.get<MedicalRecord[]>(`/patients/${patientId}/timeline`);
  return data;
};

export const fetchPrescriptions = async (recordId: number) => {
  const { data } = await apiClient.get<Prescription[]>(`/records/${recordId}/prescriptions`);
  return data;
};

export const createPrescription = async (recordId: number, payload: CreatePrescriptionPayload) => {
  const { data } = await apiClient.post<Prescription & { duplicated: boolean }>(
    `/records/${recordId}/prescriptions`,
    payload,
  );
  return data;
};

export const updatePrescriptionStatus = async (prescriptionId: number, status: string, operator: string) => {
  const { data } = await apiClient.patch<Prescription>(`/prescriptions/${prescriptionId}/status`, {
    status,
    operator,
  });
  return data;
};
