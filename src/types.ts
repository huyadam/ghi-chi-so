export interface User {
  id?: number;
  STT: number;
  MSNV: string;
  HO_TEN: string;
  ROLE: string;
  DON_VI: string;
}

export interface Customer {
  id: number;
  MA_KHANG: string;
  TEN_KHANG: string;
  MA_DDO: string;
  SO_CTO: string;
  MA_TRAM: string;
  MA_GHI_CHU: string;
  BCS: string;
  DIA_CHI: string;
  DTHOAI: string;
  LONGITUDE: string | number;
  LATITUDE: string | number;
  SLUONG_3: number;
  SLUONG_2: number;
  SLUONG_1: number;
  CHISO_CU: number | string;
  PHONG_DOI: string;
  ASSIGN: string;
  USER: string;
  CHI_SO: string;
  THOIGIAN_GHI: string;
  GHI_CHU: string;
  MA_SOGCS?: string;
  HS_NHAN?: number | string;
  created_at?: string;
  updated_at?: string;
}

export interface Station {
  id?: number;
  STT: number;
  'Mã TTG': string;
  'Tên TTG': string;
  'Mã TD': string;
  'Tên TD': string;
  TBTID: string;
  'TBTID (cũ)': string;
  'Danh số trạm': string;
  'Tên TBA': string;
  'Tên TBA (cũ)': string;
  'Loại trạm': string;
  'Số trụ': string;
  'Công suất': number;
  Pha: number;
  'Số MBA': number;
  'Kiểu trạm': string;
  'Hiệu máy': string;
  'Năm VH': number;
  X: number;
  Y: number;
  Imax: number;
  Idm: number;
  'Thời điểm Imax': string;
}
