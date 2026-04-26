export type UserRole = 'Super User' | 'CEO/CFO' | 'Financial Manager' | 'Manager' | 'Requester';

export interface Organisation {
  id: string;
  name: string;
  cipcNumber: string;
  address: string;
  telephone: string;
  logoURL?: string;
  financialYear: {
    startDate: string;
    endDate: string;
  };
  ownerUid: string;
  vatRate: number;
  subscription?: {
    status: 'trial' | 'active' | 'past_due' | 'canceled' | 'cancelling';
    trialEndDate: string;
    subscriptionEndDate?: string;
    cancelAt?: string;
    code?: string;
    plan: 'monthly';
    price: number;
  };
}

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  organisationId: string;
  currentOrg?: string;
  displayName: string;
  surname?: string;
  position?: string;
  photoURL?: string;
}

export interface Department {
  id: string;
  name: string;
  organisationId: string;
  yearlyBudget?: number;
}

export interface ChartOfAccount {
  id: string;
  name: string;
  organisationId: string;
  status?: 'Active' | 'Archived';
}

export interface ProjectSubPhase {
  name: string;
  budget: number;
  chartOfAccountBudgets?: {
    chartOfAccountId: string;
    amount: number;
  }[];
}

export interface ProjectPhase {
  id: string;
  name: string;
  budget: number;
  subPhases: ProjectSubPhase[];
}

export interface Project {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  organisationId: string;
  departmentIds: string[];
  clientId: string;
  status: 'Open' | 'Completed';
  phases?: ProjectPhase[];
  totalBudget: number;
  createdBy: string;
  isGeneral?: boolean;
}

export interface RecurringCost {
  id: string;
  name: string;
  description: string;
  amount: number;
  frequency: 'Monthly' | 'Quarterly' | 'Yearly';
  departmentIds: string[];
  chartOfAccountIds: string[];
  projectIds: string[];
  organisationId: string;
  startDate: string;
  status: 'Active' | 'Inactive';
  vatType: 'Inclusive' | 'Exclusive' | 'No VAT';
}

export interface BankDetails {
  type: 'Bank Account' | 'Cash' | 'Cash Send';
  bankName?: string;
  accountNumber?: string;
  branchCode?: string;
  accountType?: string;
  cellphoneNumber?: string;
}

export interface Attachment {
  name: string;
  type: string;
  data: string;
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  contactNumber: string;
  category: 'Supplier' | 'Employee' | 'Contractor' | 'Other';
  bankDetails?: BankDetails;
  organisationId: string;
  attachments: Attachment[];
}

export type RequisitionStatus = 
  | 'Draft' 
  | 'Submitted' 
  | 'Awaiting Departmental Approval'
  | 'Awaiting Finance Approval' 
  | 'Awaiting CEO/CFO Approval' 
  | 'Approved' 
  | 'Rejected'
  | 'Paid';

export interface ApprovalHistory {
  userId: string;
  userName: string;
  userRole: UserRole;
  date: string;
  action: 'Submitted' | 'Approved' | 'Rejected' | 'Paid';
  comment?: string;
}

export interface PaymentCycle {
  id: string;
  type: 'Weekly' | 'Bi-weekly' | 'Monthly' | 'Custom';
  startDate: string;
  endDate: string;
  paymentDates: string[];
  organisationId: string;
}

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  organisationId: string;
}

export interface RequisitionLineItem {
  id: string;
  invoiceNumber: string;
  chartOfAccountId: string;
  departmentId: string;
  projectId: string;
  phase?: string;
  subPhase?: string;
  description: string; // max 50 chars
  amount: number;
  invoiceDate: string;
  vatType: 'Inclusive' | 'Exclusive' | 'No VAT';
  vatAmount: number;
  netAmount: number;
}

export interface Requisition {
  id: string;
  date: string;
  contactId: string;
  lineItems: RequisitionLineItem[];
  totalAmount: number;
  totalVatAmount: number;
  totalNetAmount: number;
  status: RequisitionStatus;
  rejectionReason?: string;
  organisationId: string;
  createdBy: string;
  creatorName: string;
  attachments: Attachment[];
  paymentDate: string;
  isException: boolean;
  approvalHistory: ApprovalHistory[];
  // Keep old fields for backward compatibility if needed, but they will be deprecated
  invoiceNumber?: string;
  amount?: number;
  description?: string;
  chartOfAccountId?: string;
  projectId?: string;
  departmentId?: string;
  phase?: string;
  subPhase?: string;
}

export interface TaxBracket {
  min: number;
  max: number | null;
  baseTax: number;
  rate: number;
}

export interface MedicalTaxCredit {
  mainMember: number;
  firstDependant: number;
  additionalDependant: number;
}

export interface TaxConfig {
  id: string; // e.g., "2026-2027"
  year: string;
  primaryRebate: number;
  secondaryRebate: number;
  tertiaryRebate: number;
  taxThresholdUnder65: number;
  taxThreshold65To75: number;
  taxThreshold75Plus: number;
  brackets: TaxBracket[];
  medicalTaxCredits: MedicalTaxCredit;
  retirementLimitPercentage: number;
  retirementLimitCap: number;
  uifRate: number;
  uifCap: number;
  sdlRate: number;
  sdlThreshold: number;
}

export interface Contribution {
  id: string;
  type: 'Medical Aid' | 'Retirement Annuity' | 'Other';
  description: string;
  employeeAmount: number;
  employerAmount: number;
  isFringeBenefit: boolean;
}

export interface Employee {
  id: string;
  name: string;
  surname: string;
  departmentId: string;
  chartOfAccountId: string;
  grossSalary: number;
  paymentDateType: 'Last Working Day' | 'Custom';
  customPaymentDay?: number; // 1-31
  isUifContributor: boolean;
  organisationId: string;
  status: 'Active' | 'Inactive' | 'Terminated';
  hasBeenPaid?: boolean;
  medicalAidDependants: number;
  contributions: Contribution[];
  dateOfBirth: string;
}

export interface Deduction {
  id: string;
  employeeId: string;
  description: string;
  totalAmount: number;
  remainingAmount: number;
  intervals: number;
  amountPerInterval: number;
  startDate: string; // The month/date it starts
  organisationId: string;
  status: 'Active' | 'Completed';
  attachments?: Attachment[];
}

export interface PayrollEmployeeRecord {
  employeeId: string;
  name: string;
  surname: string;
  departmentId: string;
  chartOfAccountId: string;
  grossSalary: number;
  paye: number;
  uif: number;
  deductions: number;
  netSalary: number;
  taxableRemuneration: number;
  fringeBenefits: number;
  allowableDeductions: number;
  medicalTaxCredits: number;
  sdl: number;
  employerUif: number;
}

export interface PayrollRun {
  id: string;
  month: string; // YYYY-MM
  organisationId: string;
  status: 'Draft' | 'Submitted' | 'Approved';
  totalGross: number;
  totalPaye: number;
  totalUif: number;
  totalDeductions: number;
  totalNet: number;
  records: PayrollEmployeeRecord[];
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  paymentDate: string;
}
