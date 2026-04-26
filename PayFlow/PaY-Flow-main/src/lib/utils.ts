import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from '../firebase';
import { TaxConfig, Employee, PayrollEmployeeRecord } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow = false) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (shouldThrow) throw new Error(JSON.stringify(errInfo));
}

export function calculateSARS(emp: Employee, taxConfig: TaxConfig): PayrollEmployeeRecord {
  const annualGross = emp.grossSalary * 12;
  
  // 1. Calculate Fringe Benefits
  const monthlyFringeBenefits = emp.contributions
    .filter(c => c.isFringeBenefit)
    .reduce((sum, c) => sum + c.employerAmount, 0);
  const annualFringeBenefits = monthlyFringeBenefits * 12;
  
  // 2. Taxable Remuneration (Gross + Fringe Benefits)
  const annualTaxableRemuneration = annualGross + annualFringeBenefits;
  
  // 3. Allowable Deductions (RA contributions up to 27.5% cap, capped at R430,000)
  const monthlyRA = emp.contributions
    .filter(c => c.type === 'Retirement Annuity')
    .reduce((sum, c) => sum + c.employeeAmount, 0);
  const annualRA = monthlyRA * 12;
  
  const raLimit = Math.min(
    annualTaxableRemuneration * (taxConfig.retirementLimitPercentage / 100),
    taxConfig.retirementLimitCap
  );
  const annualAllowableDeductions = Math.min(annualRA, raLimit);
  
  // 4. Final Taxable Income
  const annualTaxableIncome = annualTaxableRemuneration - annualAllowableDeductions;
  
  // 5. PAYE Calculation (Sliding Scale)
  let annualTax = 0;
  for (const bracket of taxConfig.brackets) {
    if (annualTaxableIncome > bracket.min) {
      const taxableInBracket = bracket.max ? Math.min(annualTaxableIncome, bracket.max) - bracket.min : annualTaxableIncome - bracket.min;
      annualTax = bracket.baseTax + (taxableInBracket * (bracket.rate / 100));
      if (!bracket.max || annualTaxableIncome <= bracket.max) break;
    }
  }
  
  // 6. Apply Rebates based on age
  const age = calculateAge(emp.dateOfBirth);
  let totalRebate = taxConfig.primaryRebate;
  if (age >= 65) totalRebate += taxConfig.secondaryRebate;
  if (age >= 75) totalRebate += taxConfig.tertiaryRebate;
  
  annualTax = Math.max(0, annualTax - totalRebate);
  
  // 7. Medical Tax Credits
  const medicalAid = emp.contributions.find(c => c.type === 'Medical Aid');
  let annualMTC = 0;
  if (medicalAid) {
    const monthlyMTC = taxConfig.medicalTaxCredits.mainMember +
      (emp.medicalAidDependants >= 1 ? taxConfig.medicalTaxCredits.firstDependant : 0) +
      (Math.max(0, emp.medicalAidDependants - 1) * taxConfig.medicalTaxCredits.additionalDependant);
    annualMTC = monthlyMTC * 12;
  }
  
  annualTax = Math.max(0, annualTax - annualMTC);
  const monthlyPAYE = annualTax / 12;
  
  // 8. UIF Calculation
  const monthlyUIF = emp.isUifContributor ? Math.min(emp.grossSalary * (taxConfig.uifRate / 100), taxConfig.uifCap) : 0;
  const employerUIF = emp.isUifContributor ? Math.min(emp.grossSalary * (taxConfig.uifRate / 100), taxConfig.uifCap) : 0;
  
  // 9. SDL Calculation
  const monthlySDL = emp.grossSalary >= taxConfig.sdlThreshold ? emp.grossSalary * (taxConfig.sdlRate / 100) : 0;
  
  // 10. Other Deductions (Manual)
  const otherEmployeeDeductions = emp.contributions
    .filter(c => c.type !== 'Medical Aid' && c.type !== 'Retirement Annuity')
    .reduce((sum, c) => sum + c.employeeAmount, 0);
  
  const totalDeductions = monthlyUIF + monthlyRA + (medicalAid?.employeeAmount || 0) + otherEmployeeDeductions;
  
  return {
    employeeId: emp.id,
    name: emp.name,
    surname: emp.surname,
    departmentId: emp.departmentId,
    chartOfAccountId: emp.chartOfAccountId,
    grossSalary: emp.grossSalary,
    paye: monthlyPAYE,
    uif: monthlyUIF,
    deductions: totalDeductions,
    netSalary: emp.grossSalary - monthlyPAYE - totalDeductions,
    taxableRemuneration: annualTaxableRemuneration / 12,
    fringeBenefits: monthlyFringeBenefits,
    allowableDeductions: annualAllowableDeductions / 12,
    medicalTaxCredits: annualMTC / 12,
    sdl: monthlySDL,
    employerUif: employerUIF
  };
}

export function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function calculatePAYE(grossMonthly: number): number {
  // DEPRECATED: Use calculateSARS instead
  return 0;
}

export function calculateUIF(grossMonthly: number): number {
  // DEPRECATED: Use calculateSARS instead
  return 0;
}

export function getLastWorkingDayOfMonth(year: number, month: number, holidays: string[]): string {
  // month is 0-indexed (0 = Jan, 11 = Dec)
  const date = new Date(year, month + 1, 0); 
  
  while (true) {
    const day = date.getDay();
    const dateStr = date.toISOString().split('T')[0];
    
    // 0 is Sunday, 6 is Saturday
    if (day !== 0 && day !== 6 && !holidays.includes(dateStr)) {
      return dateStr;
    }
    date.setDate(date.getDate() - 1);
  }
}

export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const val = row[header];
      const stringVal = val === null || val === undefined ? '' : String(val);
      // Escape quotes and wrap in quotes if contains comma
      return `"${stringVal.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
