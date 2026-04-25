import { useState, useEffect } from 'react';
import { Employee, Client, Site, JobCard, Activity } from '../types';
import { format, subDays } from 'date-fns';

export const IS_DEMO_MODE = true; // Set to false for production

export const useDemoData = (organisationId: string | undefined) => {
  const [demoEmployees, setDemoEmployees] = useState<Employee[]>([]);
  const [demoClients, setDemoClients] = useState<Client[]>([]);
  const [demoSites, setDemoSites] = useState<Site[]>([]);
  const [demoJobCards, setDemoJobCards] = useState<JobCard[]>([]);
  const [demoActivities, setDemoActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (!IS_DEMO_MODE || !organisationId) return;

    // 10 Verified Employees
    const mockEmployees: Employee[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `emp_${i}`,
      firstName: ['John', 'Jane', 'Thabo', 'Lerato', 'Nomvula', 'Sipho', 'Palesa', 'Kabelo', 'Mpho', 'Zanele'][i],
      surname: ['Smith', 'Doe', 'Mokoena', 'Ndlovu', 'Smit', 'Botha', 'Gumede', 'Molefe', 'Zulu', 'Dlamini'][i],
      id_number: i % 2 === 0 ? `900101500${i}08${i}` : '',
      passportNumber: i % 2 !== 0 ? `A00${i}456${i}` : '',
      departmentId: 'dept_1',
      employment_category: ['Field Operations'],
      paymentMethod: 'Cash',
      verification_status: 'Verified',
      status: 'active',
      orgId: organisationId,
      createdAt: new Date().toISOString(),
      verificationStatus: {
        personalInfo: 'verified',
        bankingDetails: 'verified',
        documents: 'verified'
      }
    } as unknown as Employee));

    // 3 Clients
    const mockClients: Client[] = [
      { id: 'client_1', name: 'Golden Harvest Farms', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'client_2', name: 'Sunshine Logistics', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'client_3', name: 'Eco-Grow Agriculture', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
    ];

    // 5 Sites
    const mockSites: Site[] = [
      { id: 'site_1', clientId: 'client_1', name: 'Block A - Orchards', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'site_2', clientId: 'client_1', name: 'Block B - Vineyards', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'site_3', clientId: 'client_2', name: 'Main Warehouse', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'site_4', clientId: 'client_2', name: 'Distribution Hub', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'site_5', clientId: 'client_3', name: 'Greenhouse Complex', status: 'active', orgId: organisationId, createdAt: new Date().toISOString() },
    ];

    // Activities
    const mockActivities: Activity[] = [
      { id: 'act_1', clientId: 'client_1', name: 'Harvesting', rate_type: 'Hourly', status: 'active', subActivities: ['Apples', 'Pears', 'Grapes'], orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'act_2', clientId: 'client_1', name: 'Pruning', rate_type: 'Hourly', status: 'active', subActivities: ['Winter Pruning', 'Summer Thinning'], orgId: organisationId, createdAt: new Date().toISOString() },
      { id: 'act_3', clientId: 'client_2', name: 'Delivery', rate_type: 'Hourly', status: 'active', subActivities: ['Local', 'Export'], orgId: organisationId, createdAt: new Date().toISOString() },
    ];

    // 7 Job Cards (5 Submitted, 2 Draft)
    const mockJobCards: JobCard[] = Array.from({ length: 7 }).map((_, i) => ({
      id: `jc_${i}`,
      ref_no: `JC-DEMO-${100 + i}`,
      date: format(subDays(new Date(), i), 'yyyy-MM-dd'),
      job_card_type: i === 2 ? 'Distribution' : 'Field Operations',
      clientId: i < 4 ? 'client_1' : 'client_2',
      client_name: i < 4 ? 'Golden Harvest Farms' : 'Sunshine Logistics',
      siteId: i < 2 ? 'site_1' : 'site_3',
      site_name: i < 2 ? 'Block A - Orchards' : 'Main Warehouse',
      activityId: i < 4 ? 'act_1' : 'act_3',
      activity: i < 4 ? 'Harvesting' : 'Delivery',
      status: i < 5 ? 'Submitted' : 'Draft',
      team_employee_ids: ['emp_0', 'emp_1', 'emp_2'],
      wage_method: 'Hours',
      hours_worked: 8,
      orgId: organisationId,
      last_updated_by: 'Demo Admin',
      last_updated_at: new Date().toISOString(),
      createdAt: new Date().toISOString()
    } as unknown as JobCard));

    setDemoEmployees(mockEmployees);
    setDemoClients(mockClients);
    setDemoSites(mockSites);
    setDemoJobCards(mockJobCards);
    setDemoActivities(mockActivities);
  }, [organisationId]);

  return { demoEmployees, demoClients, demoSites, demoJobCards, demoActivities, IS_DEMO_MODE };
};
