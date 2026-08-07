export type RequestStatus = "Open" | "In Progress" | "Needs Information" | "Complete" | "Cancelled";
export type RequestPriority = "Normal" | "High" | "Urgent";
export type RequestType = "Soapbox" | "B3PL";
export type Carrier = "FedEx" | "UPS" | "USPS";
export type ServiceModel = "Soapbox Shipping Rates" | "WMS OR API" | "Basic3PL";
export type SbTier = "3PL Partner (T0)" | "Marketplace (T1)" | "Reseller (T2)" | "Enterprise (T3)" | "MM (T4)" | "SMB (T5)";
export type B3plTier = "Self Service" | "SB Direct" | "Commercial" | "Enterprise" | "Wholesale";

export type SlackFile = {
  id: string;
  name: string;
  filetype?: string;
  permalink?: string;
  uploadedAt?: string;
};

export type RateRequest = {
  id: number;
  requestNumber: string;
  requesterSlackId: string;
  requesterName: string;
  requesterEmail: string;
  requestType: RequestType;
  carriers: Carrier[];
  serviceModel?: ServiceModel | null;
  sbTier?: SbTier | null;
  b3plTier?: B3plTier | null;
  brandName: string;
  leadFirstName?: string | null;
  leadLastName?: string | null;
  leadEmail?: string | null;
  leadPhone?: string | null;
  leadWebsite?: string | null;
  description: string;
  priority: RequestPriority;
  status: RequestStatus;
  assignedSlackId?: string | null;
  assignedName?: string | null;
  channelId?: string | null;
  messageTs?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  salesforceObjectType?: string | null;
  salesforceRecordId?: string | null;
  files: SlackFile[];
};

export type RequestCreateInput = {
  requesterSlackId: string;
  requesterName: string;
  requesterEmail: string;
  requestType: RequestType;
  carriers: Carrier[];
  serviceModel?: ServiceModel;
  sbTier?: SbTier;
  b3plTier?: B3plTier;
  brandName: string;
  leadFirstName?: string;
  leadLastName: string;
  leadEmail?: string;
  leadPhone?: string;
  leadWebsite?: string;
  description: string;
  priority: RequestPriority;
  files: SlackFile[];
};

