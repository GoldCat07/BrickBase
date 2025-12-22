export type PropertyType = 'Plot' | 'Builder Floor' | 'Villa/House' | 'Apartment Society';
export type CaseType = 'REGISTRY_CASE' | 'TRANSFER_CASE' | 'OTHER';
export type PriceUnit = 'cr' | 'lakh';

export interface BuilderInfo {
  name?: string;
  phoneNumber?: string;
  countryCode?: string;
}

export interface Property {
  id: string;
  propertyType?: PropertyType;
  propertyPhotos: string[];
  floor?: number;
  price?: number;
  priceUnit?: PriceUnit;
  builderId?: string;
  builderName?: string;
  builderPhone?: string;
  builders?: BuilderInfo[];
  paymentPlan?: string;
  additionalNotes?: string;
  black?: number;
  white?: number;
  blackPercentage?: number;
  whitePercentage?: number;
  possessionDate?: string;
  userId?: string;
  userEmail?: string;
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
