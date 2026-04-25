import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { JobCard, Employee, Activity } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { FileDown, TrendingUp, Users, DollarSign, Calendar } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { useDemoData } from '../hooks/useDemoData';

export const ReportsPage: React.FC = () => {
  const { organisation } = useAuth();
  const { demoJobCards, demoEmployees, IS_DEMO_MODE } = useDemoData(organisation?.id);
  
  const { data: realJobCards } = useTenantQuery<JobCard>('jobcards');
  const { data: realEmployees } = useTenantQuery<Employee>('employees');

  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setJobCards(demoJobCards);
      setEmployees(demoEmployees);
      return;
    }

    setJobCards(IS_DEMO_MODE ? [...demoJobCards, ...realJobCards] : realJobCards);
    setEmployees(IS_DEMO_MODE ? [...demoEmployees, ...realEmployees] : realEmployees);
  }, [organisation?.id, realJobCards, realEmployees, demoJobCards, demoEmployees, IS_DEMO_MODE]);

  // Data Processing
  const monthlyData = Array.from({ length: 6 }).map((_, i) => {
    const d = subMonths(new Date(), 5 - i);
    const monthStr = format(d, 'MMM');
    const monthStart = startOfMonth(d);
    const monthEnd = endOfMonth(d);
    
    const monthCards = jobCards.filter(jc => {
      const jcDate = new Date(jc.date);
      return jcDate >= monthStart && jcDate <= monthEnd;
    });

    return {
      name: monthStr,
      cards: monthCards.length,
      revenue: monthCards.length * 1200, // Mock revenue
      cost: monthCards.length * 800 // Mock cost
    };
  });

  const typeData = [
    { name: 'Field Ops', value: jobCards.filter(jc => jc.job_card_type === 'Field Operations').length },
    { name: 'Distribution', value: jobCards.filter(jc => jc.job_card_type === 'Distribution').length },
    { name: 'Maintenance', value: jobCards.filter(jc => jc.job_card_type === 'Maintenance').length },
  ].filter(d => d.value > 0);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-secondary)] uppercase">Operational Reports</h2>
          <p className="text-[var(--color-muted-foreground)] font-bold uppercase text-[10px] tracking-widest">Visualise your farm's performance and productivity</p>
        </div>
        <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
          <FileDown className="w-4 h-4 mr-2" /> Export PDF Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-2 rounded-[2rem] shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Job Cards</p>
              <p className="text-2xl font-black text-[var(--color-secondary)]">{jobCards.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 rounded-[2rem] shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Workforce</p>
              <p className="text-2xl font-black text-[var(--color-secondary)]">{employees.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 rounded-[2rem] shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Est. Revenue</p>
              <p className="text-2xl font-black text-[var(--color-secondary)]">R{(jobCards.length * 1200).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 rounded-[2rem] shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Active Days</p>
              <p className="text-2xl font-black text-[var(--color-secondary)]">24</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-2 rounded-[2rem] shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-gray-50/50 p-6">
            <CardTitle className="text-lg font-black text-[var(--color-secondary)] uppercase tracking-tight">Monthly Activity Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[350px] w-full min-h-[350px]">
              <ResponsiveContainer width="99%" aspect={2}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f9fafb' }}
                  />
                  <Bar dataKey="cards" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 rounded-[2rem] shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-gray-50/50 p-6">
            <CardTitle className="text-lg font-black text-[var(--color-secondary)] uppercase tracking-tight">Job Card Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full min-h-[300px]">
              <ResponsiveContainer width="99%" aspect={1.5}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {typeData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
