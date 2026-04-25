import { db } from '../lib/firebase';
import { doc, updateDoc, increment, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { Employee, JobCard, LeaveRequest, Department } from '../types';
import { format, isAfter, parseISO } from 'date-fns';

export const useLeaveCalculations = () => {
  
  /**
   * Accrues leave based on a finalized Job Card.
   * 1:17 Logic: 
   * - Field Operations/Logistics: 1 hour leave per 17 hours worked.
   * - Office/General: 1 day leave per 17 days worked.
   */
  const accrueLeaveFromJobCard = async (jobCard: JobCard, employee: Employee, department?: Department) => {
    if (!jobCard.hoursWorked || !jobCard.orgId) return;

    const isLogistics = jobCard.job_card_type === 'Field Operations' || 
                        jobCard.job_card_type === 'Distribution' ||
                        (department?.name.toLowerCase().includes('logistics') || department?.name.toLowerCase().includes('field'));

    const batch = writeBatch(db);
    const empRef = doc(db, `organisations/${jobCard.orgId}/employees`, employee.id);

    if (isLogistics) {
      // 1 hour leave per 17 hours worked
      const accruedHours = jobCard.hoursWorked / 17;
      batch.update(empRef, {
        accrued_leave_hours: increment(accruedHours)
      });
    } else {
      // 1 day leave per 17 days worked (assuming 1 job card = 1 day worked for office)
      // If job cards are daily, we increment by 1/17 of a day
      const accruedDays = 1 / 17;
      batch.update(empRef, {
        accrued_leave_days: increment(accruedDays)
      });
    }

    await batch.commit();
  };

  /**
   * Processes approved leave that has passed its end date.
   * Subtracts from balance and marks as processed.
   */
  const autoProcessPassedLeave = async (orgId: string) => {
    const now = new Date();
    const leavePath = `organisations/${orgId}/leaveRequests`;
    const q = query(
      collection(db, leavePath),
      where('status', '==', 'Approved'),
      where('is_processed', '==', false)
    );

    const snap = await getDocs(q);
    const batch = writeBatch(db);

    for (const d of snap.docs) {
      const leave = { id: d.id, ...d.data() } as LeaveRequest;
      if (isAfter(now, parseISO(leave.end_date))) {
        const empRef = doc(db, `organisations/${orgId}/employees`, leave.employee_id);
        
        // Deduction logic
        if (leave.leave_type === 'Sick') {
          batch.update(empRef, {
            sick_leave_balance: increment(-leave.days)
          });
        } else if (leave.leave_type === 'Annual') {
          // Assuming 8 hours per day for conversion if needed, but usually it's days for office
          batch.update(empRef, {
            accrued_leave_days: increment(-leave.days)
          });
        }

        batch.update(doc(db, leavePath, leave.id), {
          is_processed: true
        });
      }
    }

    if (snap.size > 0) {
      await batch.commit();
    }
  };

  /**
   * Initializes or refreshes the 3-year sick leave cycle (30 days).
   */
  const refreshSickLeaveCycle = async (employee: Employee, orgId: string) => {
    const cycleStart = employee.sick_leave_cycle_start ? parseISO(employee.sick_leave_cycle_start) : null;
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    if (!cycleStart || isAfter(threeYearsAgo, cycleStart)) {
      const empRef = doc(db, `organisations/${orgId}/employees`, employee.id);
      await updateDoc(empRef, {
        sick_leave_balance: 30,
        sick_leave_cycle_start: new Date().toISOString()
      });
    }
  };

  return {
    accrueLeaveFromJobCard,
    autoProcessPassedLeave,
    refreshSickLeaveCycle
  };
};
