export type UserRole = 'admin' | 'manager' | 'qa' | 'supervisor' | 'operator';

export interface Organisation {
  id: string;
  isDemo?: boolean;
  registered_name: string;
  registration_number: string;
  income_tax_no: string;
  paye_ref_no?: string;
  ufiling_ref_no?: string;
  industry: 'Agriculture' | 'Construction' | 'Mining' | 'Manufacturing' | 'Logistics' | 'Hospitality' | 'Retail' | 'Other';
  business_address: string;
  tel_work: string;
  website?: string;
  profile_picture?: string;
  bio?: string;
  location?: string;
  theme_color?: string;
  owner_email: string;
  financial_year_start?: string;
  financial_year_end?: string;
  status: 'active' | 'deactivated';
  createdAt: string;
  // Legacy fields for compatibility
  name?: string;
  cipcRegistration?: string;
  address?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  trialStartDate?: string;
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'canceled';
  subscriptionPlan?: 'basic' | 'unlimited' | 'pro' | 'enterprise';
  trialEndDate?: string;
  uifPercentage?: number;
  stripeCustomerId?: string;
  paystackCustomerCode?: string;
}

export type SubscriptionPlan = {
  id: 'basic' | 'unlimited' | 'pro' | 'enterprise';
  name: string;
  price: number;
  features: string[];
};

export interface Member {
  uid: string;
  email: string;
  role: UserRole;
  joinedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  orgId: string;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  grace_period_days: number;
  status: 'active' | 'inactive';
  orgId: string;
  createdAt: string;
  // Legacy
  payCycle?: string;
  monthlyOption?: string;
  specificDay?: number;
  weeklyStartDate?: string;
}

export interface Activity {
  id: string;
  clientId: string;
  siteId?: string;
  name: string; // activity_name in spec
  wageRate?: number;
  billingRate?: number;
  rate_type: 'Hourly' | 'Piecework';
  status: 'active' | 'inactive';
  orgId: string;
  createdAt: string;
  // Legacy
  subActivities?: string[];
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  surname?: string; // Spec uses surname
  id_type: 'ID' | 'Passport' | 'Asylum';
  id_number: string;
  departmentId: string;
  department_name?: string;
  employment_category: ('Field Operations' | 'Support Operations')[];
  date_of_birth?: string;
  gender?: 'Male' | 'Female';
  commencement_date?: string;
  cell_no?: string;
  paymentMethod: 'Cash' | 'EFT' | 'PayShap';
  bank_name?: string;
  account_no?: string;
  branch_code?: string;
  linked_cell_no?: string; // for PayShap
  id_attachment?: string;
  bank_attachment?: string;
  work_agreement_attachment?: string;
  verification_status: 'Draft' | 'Pending Verification' | 'Verified' | 'Rejected' | 'Flagged';
  verified_by?: string;
  verified_date?: string;
  termination_date?: string;
  status: 'active' | 'terminated' | 'draft';
  employee_code?: string;
  accrued_leave_hours: number;
  accrued_leave_days: number;
  sick_leave_balance: number;
  sick_leave_cycle_start: string;
  orgId: string;
  createdAt: string;

  // Legacy fields for compatibility
  idNumber?: string;
  passportNumber?: string;
  asylumNumber?: string;
  paymentDetails?: any;
  verificationStatus?: any;
  documents?: any;
  isTerminated?: boolean;
  terminationDate?: string;
}

export interface Deduction {
  id: string;
  employeeId: string;
  name: string;
  amount: number;
  totalIntervals: number;
  remainingIntervals: number;
  firstPaymentDate: string;
  attachments: string[];
  type: 'statutory' | 'manual';
  orgId: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  registration_no?: string;
  physical_address?: string;
  billing_address?: string;
  email?: string;
  contact_no?: string;
  vat_no?: string;
  status: 'active' | 'inactive';
  orgId: string;
  createdAt: string;
  // Legacy
  phone?: string;
  address?: string;
}

export interface Site {
  id: string;
  clientId: string;
  client_name?: string;
  name: string; // site_name in spec
  address?: string;
  status: 'active' | 'inactive';
  orgId: string;
  createdAt: string;
  // Legacy
  location?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  clientId: string;
  client_name?: string;
  jobCardIds: string[];
  line_items?: {
    ref_no: string;
    product: string;
    quantity: number;
    rate: number;
    total: number;
  }[];
  subtotal?: number;
  vat_amount?: number;
  totalAmount: number; // total in spec
  date?: string;
  due_date?: string;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
  orgId: string;
  createdAt: string;
  // Legacy
  invoiceNumber?: string;
}

export interface JobCard {
  id: string;
  ref_no?: string;
  job_card_type: 'Field Operations' | 'Distribution' | 'Maintenance' | 'Other' | 'Site';
  clientId: string;
  client_name?: string;
  supervisor_employee_id?: string;
  supervisor_name?: string;
  date: string;
  remuneration_type?: 'Team Output' | 'Individual Output';
  team_employee_ids?: string[];
  team_employee_names?: string[];
  siteId: string;
  site_name?: string;
  activity?: string;
  activityId: string;
  wageRate?: number;
  billingRate?: number;
  rate_type?: 'Hourly' | 'Piecework';
  wage_method?: string;
  billing_method?: string;
  product?: string;
  product_variation?: string;
  quantity?: number;
  startTime?: string;
  endTime?: string;
  lunch_start?: string;
  lunch_finish?: string;
  hoursWorked: number;
  pickupLocation?: string;
  dropoffLocation?: string;
  primary_vehicle_reg?: string;
  opening_mileage?: number;
  closing_mileage?: number;
  km_travelled?: number;
  trailer_registrations?: string[];
  fueling_entries?: {
    fuel_litres: number;
    fuel_supplier: string;
    payment_method: string;
    fuel_cost: number;
    datetime: string;
    receipt_url?: string;
  }[];
  loads?: {
    reference_no: string;
    product_variation: string;
    net_mass: number;
    documents: string[];
  }[];
  project_name?: string;
  attachments?: string[];
  status: 'Draft' | 'Submitted' | 'Approved' | 'Verified' | 'Invoiced' | 'Paid' | 'Rejected';
  approved_for_invoicing?: boolean;
  approved_for_wages?: boolean;
  approved_invoicing_by?: string;
  approved_invoicing_at?: string;
  approved_wages_by?: string;
  approved_wages_at?: string;
  last_updated_by?: string;
  last_updated_at?: string;
  total_wage_amount?: number;
  total_invoice_amount?: number;
  verified_by?: string;
  verified_date?: string;
  invoiced_date?: string;
  invoice_id?: string;
  wages_paid_date?: string;
  department_id?: string;
  department_name?: string;
  orgId: string;
  createdAt: string;

  // Legacy fields for compatibility
  reference?: string;
  category?: string;
  team?: string[];
  subActivity?: string;
  supportingDocs?: string[];
  creatorId?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  individualOutputs?: Record<string, number>;
  fuelEntries?: any;
}

export interface PayrollPeriod {
  id: string;
  department_id: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'processed' | 'cancelled';
  processed_by?: string;
  processed_at?: string;
  orgId: string;
  createdAt: string;
}

export interface PayrollRun {
  id: string;
  run_number: string;
  department_id: string;
  department_name: string;
  pay_cycle_id?: string;
  pay_date: string;
  payment_type: 'scheduled' | 'special';
  special_reason?: string;
  employee_payments: {
    employee_id: string;
    employee_name: string;
    id_number: string;
    gross_income: number;
    uif: number;
    deductions_total: number;
    net_pay: number;
    payment_method: string;
    bank_name?: string;
    account_no?: string;
    branch_code?: string;
    linked_cell_no?: string;
    job_card_ids: string[];
  }[];
  total_gross: number;
  total_net: number;
  total_uif: number;
  total_deductions: number;
  employee_count: number;
  status: 'processed' | 'cancelled';
  processed_by: string;
  notes?: string;
  orgId: string;
  createdAt: string;
}

export interface ClientProduct {
  id: string;
  clientId: string;
  client_name: string;
  product_name: string;
  variations: string[];
  status: 'active' | 'inactive';
  orgId: string;
  createdAt: string;
}

export interface PayCycle {
  id: string;
  department_id: string;
  department_name: string;
  cycle_type: 'weekly' | 'bi-weekly' | 'monthly';
  cycle_start_date: string;
  pay_date_rule_type: 'days_after_cycle_end' | 'specific_date' | 'last_day_of_month';
  pay_date_days_after?: number;
  pay_date_specific_day?: number;
  status: 'active' | 'inactive';
  orgId: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: 'Annual' | 'Sick' | 'Family Responsibility' | 'Unpaid';
  start_date: string;
  end_date: string;
  days: number;
  reason?: string;
  supporting_document?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by?: string;
  department_id?: string;
  is_processed: boolean;
  payout_amount?: number;
  payout_type?: 'Full Balance' | 'Custom' | 'Standard';
  orgId: string;
  createdAt: string;
}

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  financial_year: string;
  orgId: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  user_email: string;
  type: 'job_card_stale' | 'approval_invoicing' | 'approval_wages' | 'general';
  title: string;
  message: string;
  job_card_id?: string;
  job_card_ref?: string;
  is_read: boolean;
  is_dismissed: boolean;
  orgId: string;
  createdAt: string;
}

export interface UserSession {
  id: string;
  user_email: string;
  user_name?: string;
  user_role?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  location_label?: string;
  device?: string;
  last_active: string;
  orgId: string;
}
