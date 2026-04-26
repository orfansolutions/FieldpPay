import { Organisation, UserProfile, Requisition, Contact, Project, Department, ChartOfAccount, PaymentCycle, Employee, Deduction, RecurringCost } from '../types';

export const DEMO_ORG: Organisation = {
  id: 'demo-org-123',
  name: 'Demo Construction Ltd',
  cipcNumber: '2024/000000/07',
  address: '123 Demo Street, Cape Town, 8001',
  telephone: '+27 21 000 0000',
  financialYear: {
    startDate: '2024-03-01',
    endDate: '2025-02-28',
  },
  ownerUid: 'demo-user-123',
  vatRate: 15,
  subscription: {
    status: 'active',
    trialEndDate: '2024-12-31',
    plan: 'monthly',
    price: 450.00
  }
};

export const DEMO_PROFILE: UserProfile = {
  uid: 'demo-user-123',
  email: 'demo@payflow.co.za',
  role: 'Super User',
  organisationId: 'demo-org-123',
  displayName: 'Demo',
  surname: 'User',
  position: 'Managing Director',
};

export const DEMO_DEPARTMENTS: Department[] = [
  { id: 'dept-1', name: 'Operations', organisationId: 'demo-org-123' },
  { id: 'dept-2', name: 'Finance', organisationId: 'demo-org-123' },
  { id: 'dept-3', name: 'HR', organisationId: 'demo-org-123' },
  { id: 'dept-4', name: 'Marketing', organisationId: 'demo-org-123' },
  { id: 'dept-5', name: 'Logistics', organisationId: 'demo-org-123' },
];

export const DEMO_CHART_OF_ACCOUNTS: ChartOfAccount[] = [
  { id: 'cc-1', name: 'Main Office', organisationId: 'demo-org-123' },
  { id: 'cc-2', name: 'Site A', organisationId: 'demo-org-123' },
  { id: 'cc-3', name: 'Site B', organisationId: 'demo-org-123' },
  { id: 'cc-4', name: 'Salaries and Wages', organisationId: 'demo-org-123' },
];

export const DEMO_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'Sandton Mall Expansion',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    organisationId: 'demo-org-123',
    departmentIds: ['dept-1'],
    clientId: 'client-1',
    status: 'Open',
    totalBudget: 5000000,
    createdBy: 'demo-user-123',
    phases: [
      {
        id: 'phase-1',
        name: 'Foundation & Earthworks',
        budget: 1500000,
        subPhases: [
          {
            name: 'Excavation',
            budget: 500000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-2', amount: 300000 },
              { chartOfAccountId: 'cc-3', amount: 200000 }
            ]
          },
          {
            name: 'Piling',
            budget: 1000000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-2', amount: 1000000 }
            ]
          }
        ]
      },
      {
        id: 'phase-2',
        name: 'Structural Steel',
        budget: 2000000,
        subPhases: [
          {
            name: 'Fabrication',
            budget: 1200000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-1', amount: 1200000 }
            ]
          },
          {
            name: 'Erection',
            budget: 800000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-2', amount: 400000 },
              { chartOfAccountId: 'cc-3', amount: 400000 }
            ]
          }
        ]
      },
      {
        id: 'phase-3',
        name: 'Finishing & Interior',
        budget: 1500000,
        subPhases: [
          {
            name: 'Tiling',
            budget: 750000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-2', amount: 750000 }
            ]
          },
          {
            name: 'Painting',
            budget: 750000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-3', amount: 750000 }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'proj-2',
    name: 'Cape Town Waterfront Renovation',
    startDate: '2024-02-01',
    endDate: '2024-11-30',
    organisationId: 'demo-org-123',
    departmentIds: ['dept-1'],
    clientId: 'client-2',
    status: 'Open',
    totalBudget: 2500000,
    createdBy: 'demo-user-123',
    phases: [
      {
        id: 'phase-2-1',
        name: 'Demolition',
        budget: 500000,
        subPhases: [
          {
            name: 'Internal Stripping',
            budget: 500000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-2', amount: 500000 }
            ]
          }
        ]
      },
      {
        id: 'phase-2-2',
        name: 'Reconstruction',
        budget: 2000000,
        subPhases: [
          {
            name: 'Masonry',
            budget: 1000000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-2', amount: 1000000 }
            ]
          },
          {
            name: 'Electrical & Plumbing',
            budget: 1000000,
            chartOfAccountBudgets: [
              { chartOfAccountId: 'cc-3', amount: 1000000 }
            ]
          }
        ]
      }
    ]
  }
];

export const DEMO_CONTACTS: Contact[] = [
  {
    id: 'cont-1',
    name: 'Build-It Supplies',
    email: 'sales@buildit.co.za',
    contactNumber: '+27 11 111 1111',
    category: 'Supplier',
    organisationId: 'demo-org-123',
    attachments: [],
    bankDetails: {
      type: 'Bank Account',
      bankName: 'FNB',
      accountNumber: '62000000000',
      branchCode: '250655',
      accountType: 'Cheque'
    }
  },
  {
    id: 'cont-2',
    name: 'Quick Logistics',
    email: 'info@quicklog.co.za',
    contactNumber: '+27 21 222 2222',
    category: 'Contractor',
    organisationId: 'demo-org-123',
    attachments: [],
    bankDetails: {
      type: 'Bank Account',
      bankName: 'Standard Bank',
      accountNumber: '10000000000',
      branchCode: '051001',
      accountType: 'Current'
    }
  },
  {
    id: 'cont-3',
    name: 'Legal Eagle Associates',
    email: 'legal@eagles.co.za',
    contactNumber: '+27 11 333 3333',
    category: 'Supplier',
    organisationId: 'demo-org-123',
    attachments: [],
    bankDetails: {
      type: 'Bank Account',
      bankName: 'Nedbank',
      accountNumber: '1234567890',
      branchCode: '198765',
      accountType: 'Current'
    }
  },
  {
    id: 'cont-4',
    name: 'Cloud Accounting Solutions',
    email: 'support@cloudacc.co.za',
    contactNumber: '+27 12 444 4444',
    category: 'Supplier',
    organisationId: 'demo-org-123',
    attachments: [],
    bankDetails: {
      type: 'Bank Account',
      bankName: 'Capitec',
      accountNumber: '9876543210',
      branchCode: '470010',
      accountType: 'Savings'
    }
  },
  {
    id: 'cont-5',
    name: 'Office Depot',
    email: 'orders@officedepot.co.za',
    contactNumber: '+27 11 555 5555',
    category: 'Supplier',
    organisationId: 'demo-org-123',
    attachments: [],
    bankDetails: {
      type: 'Bank Account',
      bankName: 'Investec',
      accountNumber: '1122334455',
      branchCode: '580105',
      accountType: 'Current'
    }
  },
  {
    id: 'cont-6',
    name: 'Security Pros',
    email: 'info@secpros.co.za',
    contactNumber: '+27 11 666 6666',
    category: 'Supplier',
    organisationId: 'demo-org-123',
    attachments: [],
    bankDetails: {
      type: 'Bank Account',
      bankName: 'Absa',
      accountNumber: '5544332211',
      branchCode: '632005',
      accountType: 'Current'
    }
  }
];

export const DEMO_REQUISITIONS: Requisition[] = [
  {
    id: 'req-1',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-1',
    organisationId: 'demo-org-123',
    status: 'Approved',
    totalAmount: 15000,
    totalVatAmount: 1956.52,
    totalNetAmount: 13043.48,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-1',
        invoiceNumber: 'INV-001',
        chartOfAccountId: 'cc-2',
        departmentId: 'dept-1',
        projectId: 'proj-1',
        phase: 'Foundation & Earthworks',
        subPhase: 'Excavation',
        description: 'Cement and Bricks for Site A',
        amount: 15000,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 1956.52,
        netAmount: 13043.48
      }
    ]
  },
  {
    id: 'req-2',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-2',
    organisationId: 'demo-org-123',
    status: 'Submitted',
    totalAmount: 8500,
    totalVatAmount: 1108.70,
    totalNetAmount: 7391.30,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-2',
        invoiceNumber: 'INV-002',
        chartOfAccountId: 'cc-1',
        departmentId: 'dept-5',
        projectId: 'proj-2',
        phase: 'Demolition',
        subPhase: 'Internal Stripping',
        description: 'Logistics delivery for Site B',
        amount: 8500,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 1108.70,
        netAmount: 7391.30
      }
    ]
  },
  {
    id: 'req-3',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-3',
    organisationId: 'demo-org-123',
    status: 'Awaiting CEO/CFO Approval' as any,
    totalAmount: 12000,
    totalVatAmount: 1565.22,
    totalNetAmount: 10434.78,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-3',
        invoiceNumber: 'INV-003',
        chartOfAccountId: 'cc-1',
        departmentId: 'dept-2',
        projectId: 'proj-1',
        phase: 'Structural Steel',
        subPhase: 'Fabrication',
        description: 'Legal Consultation Fees',
        amount: 12000,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 1565.22,
        netAmount: 10434.78
      }
    ]
  },
  {
    id: 'req-4',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-4',
    organisationId: 'demo-org-123',
    status: 'Approved',
    totalAmount: 2500,
    totalVatAmount: 326.09,
    totalNetAmount: 2173.91,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-4',
        invoiceNumber: 'INV-004',
        chartOfAccountId: 'cc-1',
        departmentId: 'dept-2',
        projectId: 'proj-1',
        phase: 'Structural Steel',
        subPhase: 'Fabrication',
        description: 'Monthly Accounting Subscription',
        amount: 2500,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 326.09,
        netAmount: 2173.91
      }
    ]
  },
  {
    id: 'req-5',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-5',
    organisationId: 'demo-org-123',
    status: 'Paid',
    totalAmount: 4500,
    totalVatAmount: 586.96,
    totalNetAmount: 3913.04,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-5',
        invoiceNumber: 'INV-005',
        chartOfAccountId: 'cc-1',
        departmentId: 'dept-4',
        projectId: 'proj-2',
        phase: 'Reconstruction',
        subPhase: 'Masonry',
        description: 'Marketing Materials',
        amount: 4500,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 586.96,
        netAmount: 3913.04
      }
    ]
  },
  {
    id: 'req-6',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-6',
    organisationId: 'demo-org-123',
    status: 'Submitted',
    totalAmount: 3200,
    totalVatAmount: 417.39,
    totalNetAmount: 2782.61,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-6',
        invoiceNumber: 'INV-006',
        chartOfAccountId: 'cc-2',
        departmentId: 'dept-1',
        projectId: 'proj-1',
        phase: 'Foundation & Earthworks',
        subPhase: 'Piling',
        description: 'Site Security Services',
        amount: 3200,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 417.39,
        netAmount: 2782.61
      }
    ]
  },
  {
    id: 'req-7',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-1',
    organisationId: 'demo-org-123',
    status: 'Draft',
    totalAmount: 12500,
    totalVatAmount: 1630.43,
    totalNetAmount: 10869.57,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-7',
        invoiceNumber: 'INV-007',
        chartOfAccountId: 'cc-3',
        departmentId: 'dept-1',
        projectId: 'proj-2',
        description: 'Electrical Supplies',
        amount: 12500,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 1630.43,
        netAmount: 10869.57
      }
    ]
  },
  {
    id: 'req-8',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-2',
    organisationId: 'demo-org-123',
    status: 'Awaiting Finance Approval' as any,
    totalAmount: 6800,
    totalVatAmount: 886.96,
    totalNetAmount: 5913.04,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-8',
        invoiceNumber: 'INV-008',
        chartOfAccountId: 'cc-2',
        departmentId: 'dept-5',
        projectId: 'proj-1',
        description: 'Transport Services',
        amount: 6800,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 886.96,
        netAmount: 5913.04
      }
    ]
  },
  {
    id: 'req-9',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-5',
    organisationId: 'demo-org-123',
    status: 'Rejected',
    totalAmount: 1500,
    totalVatAmount: 195.65,
    totalNetAmount: 1304.35,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: false,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-9',
        invoiceNumber: 'INV-009',
        chartOfAccountId: 'cc-1',
        departmentId: 'dept-3',
        projectId: 'proj-1',
        description: 'Staff Refreshments',
        amount: 1500,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 195.65,
        netAmount: 1304.35
      }
    ]
  },
  {
    id: 'req-10',
    date: new Date().toISOString().split('T')[0],
    contactId: 'cont-6',
    organisationId: 'demo-org-123',
    status: 'Approved',
    totalAmount: 5500,
    totalVatAmount: 717.39,
    totalNetAmount: 4782.61,
    createdBy: 'demo-user-123',
    creatorName: 'Demo User',
    attachments: [],
    paymentDate: new Date().toISOString().split('T')[0],
    isException: true,
    approvalHistory: [],
    lineItems: [
      {
        id: 'li-10',
        invoiceNumber: 'INV-010',
        chartOfAccountId: 'cc-3',
        departmentId: 'dept-1',
        projectId: 'proj-2',
        description: 'Emergency Repair Services',
        amount: 5500,
        invoiceDate: new Date().toISOString().split('T')[0],
        vatType: 'Inclusive',
        vatAmount: 717.39,
        netAmount: 4782.61
      }
    ]
  }
];

export const DEMO_PAYMENT_CYCLES: PaymentCycle[] = [
  {
    id: 'cycle-1',
    type: 'Monthly',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    paymentDates: [new Date().toISOString().split('T')[0]],
    organisationId: 'demo-org-123'
  }
];

export const DEMO_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    name: 'John',
    surname: 'Smith',
    departmentId: 'dept-1',
    chartOfAccountId: 'cc-2',
    grossSalary: 45000,
    isUifContributor: true,
    paymentDateType: 'Last Working Day',
    organisationId: 'demo-org-123',
    status: 'Active',
    medicalAidDependants: 2,
    contributions: [
      { id: 'c1', type: 'Medical Aid', description: 'Discovery Health', employeeAmount: 2500, employerAmount: 2500, isFringeBenefit: false }
    ],
    dateOfBirth: '1985-05-15'
  },
  {
    id: 'emp-2',
    name: 'Sarah',
    surname: 'Johnson',
    departmentId: 'dept-2',
    chartOfAccountId: 'cc-1',
    grossSalary: 55000,
    isUifContributor: true,
    paymentDateType: 'Last Working Day',
    organisationId: 'demo-org-123',
    status: 'Active',
    medicalAidDependants: 1,
    contributions: [
      { id: 'c2', type: 'Retirement Annuity', description: 'Old Mutual', employeeAmount: 3000, employerAmount: 0, isFringeBenefit: false }
    ],
    dateOfBirth: '1990-08-22'
  },
  {
    id: 'emp-3',
    name: 'Michael',
    surname: 'Brown',
    departmentId: 'dept-3',
    chartOfAccountId: 'cc-1',
    grossSalary: 40000,
    isUifContributor: true,
    paymentDateType: 'Last Working Day',
    organisationId: 'demo-org-123',
    status: 'Active',
    medicalAidDependants: 0,
    contributions: [],
    dateOfBirth: '1995-03-10'
  },
  {
    id: 'emp-4',
    name: 'Emily',
    surname: 'Davis',
    departmentId: 'dept-4',
    chartOfAccountId: 'cc-1',
    grossSalary: 38000,
    isUifContributor: true,
    paymentDateType: 'Last Working Day',
    organisationId: 'demo-org-123',
    status: 'Active',
    medicalAidDependants: 0,
    contributions: [],
    dateOfBirth: '1998-11-05'
  },
  {
    id: 'emp-5',
    name: 'David',
    surname: 'Wilson',
    departmentId: 'dept-5',
    chartOfAccountId: 'cc-3',
    grossSalary: 35000,
    isUifContributor: true,
    paymentDateType: 'Last Working Day',
    organisationId: 'demo-org-123',
    status: 'Active',
    medicalAidDependants: 0,
    contributions: [],
    dateOfBirth: '1982-01-30'
  }
];

export const DEMO_DEDUCTIONS: Deduction[] = [
  {
    id: 'ded-1',
    employeeId: 'emp-1',
    description: 'Staff Loan',
    totalAmount: 10000,
    remainingAmount: 8000,
    intervals: 10,
    amountPerInterval: 1000,
    startDate: '2024-01-01',
    status: 'Active',
    organisationId: 'demo-org-123'
  },
  {
    id: 'ded-2',
    employeeId: 'emp-3',
    description: 'Uniform Deduction',
    totalAmount: 1500,
    remainingAmount: 500,
    intervals: 3,
    amountPerInterval: 500,
    startDate: '2024-03-01',
    status: 'Active',
    organisationId: 'demo-org-123'
  },
  {
    id: 'ded-3',
    employeeId: 'emp-5',
    description: 'Tool Advance',
    totalAmount: 3000,
    remainingAmount: 3000,
    intervals: 6,
    amountPerInterval: 500,
    startDate: '2024-04-01',
    status: 'Active',
    organisationId: 'demo-org-123'
  }
];

export const DEMO_RECURRING_COSTS: RecurringCost[] = [
  {
    id: 'rc-1',
    name: 'Legal Retainer Fees',
    description: 'Monthly legal consultation retainer',
    amount: 5000,
    frequency: 'Monthly',
    departmentIds: ['dept-2'],
    chartOfAccountIds: ['cc-1'],
    projectIds: [],
    organisationId: 'demo-org-123',
    startDate: '2024-03-01',
    status: 'Active',
    vatType: 'Inclusive'
  },
  {
    id: 'rc-2',
    name: 'Accounting System Subscription',
    description: 'Cloud accounting software monthly fee',
    amount: 1500,
    frequency: 'Monthly',
    departmentIds: ['dept-2'],
    chartOfAccountIds: ['cc-1'],
    projectIds: [],
    organisationId: 'demo-org-123',
    startDate: '2024-03-01',
    status: 'Active',
    vatType: 'Inclusive'
  },
  {
    id: 'rc-3',
    name: 'Office Security Services',
    description: 'Monthly security monitoring and response',
    amount: 3500,
    frequency: 'Monthly',
    departmentIds: ['dept-1'],
    chartOfAccountIds: ['cc-1', 'cc-2', 'cc-3'],
    projectIds: [],
    organisationId: 'demo-org-123',
    startDate: '2024-03-01',
    status: 'Active',
    vatType: 'Inclusive'
  }
];

