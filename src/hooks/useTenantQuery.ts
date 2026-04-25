import { collection, query, where, QueryConstraint, onSnapshot, DocumentData, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../AuthContext';
import { useEffect, useState, useMemo } from 'react';

/**
 * useTenantQuery
 * 
 * A centralized hook for fetching tenant-scoped data in FieldPay.
 * Automatically appends a 'orgId' filter to maintain strict isolation.
 * Automatically clears data when switching organisations to prevent leaks.
 */
export function useTenantQuery<T = DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  dependencies: any[] = []
) {
  const { organisation, isSwitching } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 1. Data Cleansing on Switch: Immediately wipe state
    if (!organisation || isSwitching) {
      setData([]);
      setLoading(true);
      return;
    }

    // 2. Database Query Hard-Coding: Automatically append organisation filter
    // Skip Firestore query for demo organisations to avoid permission errors
    if (organisation.id.startsWith('demo_')) {
      setData([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `organisations/${organisation.id}/${collectionName}`),
      where('orgId', '==', organisation.id),
      ...constraints
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as unknown as T));
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error(`FieldPay Tenant Query Error [${collectionName}]:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
    // 3. Reactive Dependency: Hook re-sets and re-fetches if organisation values change
  }, [organisation?.id, isSwitching, collectionName, ...dependencies]);

  return { data, loading, error };
}
