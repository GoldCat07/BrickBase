export type PropertyType = 'Plot' | 'Builder Floor' | 'Villa/House' | 'Apartment Society';
export type CaseType = 'REGISTRY_CASE' | 'TRANSFER_CASE' | 'OTHER';

export interface Property {
  id: string;
  propertyType?: PropertyType;
  propertyPhotos: string[];
  floor?: number;
  price?: number;
  builderId?: string;
  black?: number;
  white?: number;
  blackPercentage?: number;
  whitePercentage?: number;
  possessionDate?: string;
  userId?: string;
  clubProperty: boolean;
  poolProperty: boolean;
  parkProperty: boolean;
  gatedProperty: boolean;
  propertyAge?: number;
  handoverDate?: string;
  case?: CaseType;
  latitude?: number;
  longitude?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Builder {
  id: string;
  name?: string;
  phoneNumber?: string;
  createdAt?: string;
  updatedAt?: string;
}
