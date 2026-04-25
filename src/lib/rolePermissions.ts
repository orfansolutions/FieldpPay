import { UserRole } from '../types';

export type Permission = 
  | 'canCreateEmployees'
  | 'canVerifyEmployees'
  | 'canCreateJobCards'
  | 'canApproveJobCards'
  | 'canApproveInvoicing'
  | 'canApproveWages'
  | 'canProcessPayroll'
  | 'canGenerateInvoices'
  | 'canManageDeductions'
  | 'canManageInvoicing'
  | 'canManageClients'
  | 'canViewReports'
  | 'canManageSettings'
  | 'canManageUsers'
  | 'canManageOrg';

const permissionMatrix: Record<UserRole, Partial<Record<Permission, boolean>>> = {
  admin: {
    canCreateEmployees: true,
    canVerifyEmployees: true,
    canCreateJobCards: true,
    canApproveJobCards: true,
    canApproveInvoicing: true,
    canApproveWages: true,
    canProcessPayroll: true,
    canGenerateInvoices: true,
    canManageDeductions: true,
    canManageInvoicing: true,
    canManageClients: true,
    canViewReports: true,
    canManageSettings: true,
    canManageUsers: true,
    canManageOrg: true,
  },
  manager: {
    canCreateEmployees: true,
    canVerifyEmployees: false,
    canCreateJobCards: true,
    canApproveJobCards: true,
    canApproveInvoicing: true,
    canApproveWages: true,
    canProcessPayroll: true,
    canGenerateInvoices: true,
    canManageDeductions: true,
    canManageInvoicing: true,
    canManageClients: true,
    canViewReports: true,
    canManageSettings: false,
    canManageUsers: false,
    canManageOrg: false,
  },
  qa: {
    canCreateEmployees: true,
    canVerifyEmployees: true,
    canCreateJobCards: true,
    canApproveJobCards: true,
    canApproveInvoicing: true, // configurable in spec, default true for now
    canApproveWages: true,     // configurable in spec, default true for now
    canProcessPayroll: false,
    canGenerateInvoices: true,
    canManageDeductions: true,
    canManageInvoicing: true,
    canManageClients: true,
    canViewReports: true,
    canManageSettings: false,
    canManageUsers: false,
    canManageOrg: false,
  },
  supervisor: {
    canCreateEmployees: false,
    canVerifyEmployees: false,
    canCreateJobCards: true,
    canApproveJobCards: false,
    canApproveInvoicing: false,
    canApproveWages: false,
    canProcessPayroll: false,
    canManageDeductions: false,
    canManageInvoicing: false,
    canManageClients: false,
    canViewReports: false,
    canManageSettings: false,
    canManageUsers: false,
    canManageOrg: false,
  },
  operator: {
    canCreateEmployees: false,
    canVerifyEmployees: false,
    canCreateJobCards: true,
    canApproveJobCards: false,
    canApproveInvoicing: false,
    canApproveWages: false,
    canProcessPayroll: false,
    canManageDeductions: false,
    canManageInvoicing: false,
    canManageClients: false,
    canViewReports: false,
    canManageSettings: false,
    canManageUsers: false,
    canManageOrg: false,
  }
};

export const hasPermission = (role: UserRole, permission: Permission): boolean => {
  return !!permissionMatrix[role]?.[permission];
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  qa: 'QA / Verifier',
  supervisor: 'Supervisor',
  operator: 'Operator'
};
