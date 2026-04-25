import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, collectionGroup, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { UserProfile, Organisation, UserRole } from './types';
import { hasPermission, Permission } from './lib/rolePermissions';
import { IS_DEMO_MODE } from './hooks/useDemoData';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  organisation: Organisation | null;
  userOrganisations: Organisation[];
  loading: boolean;
  isSwitching: boolean;
  setIsSwitching: (switching: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganisation: (orgId: string, org?: Organisation) => void;
  can: (permission: Permission) => boolean;
  isPro: boolean;
  isSubscriptionActive: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  organisation: null,
  userOrganisations: [],
  loading: true,
  isSwitching: false,
  setIsSwitching: () => {},
  signInWithGoogle: async () => {},
  login: async () => {},
  signUp: async () => {},
  logout: async () => {},
  switchOrganisation: () => {},
  can: () => false,
  isPro: false,
  isSubscriptionActive: false
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [userOrganisations, setUserOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleAuthError = (error: any) => {
    console.error('Auth Error:', error);
    if (error.code === 'auth/operation-not-allowed') {
      toast.error(
        'Authentication provider not enabled. Please enable Email/Password and Google Auth in the Firebase Console (Authentication > Sign-in method).',
        { duration: 10000 }
      );
    } else {
      toast.error(error.message || 'An authentication error occurred.');
    }
  };

  const createInitialProfile = async (firebaseUser: User) => {
    const profileRef = doc(db, 'users', firebaseUser.uid);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      const orgId = `org_${Date.now()}`;
      const trialStartDate = new Date();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialStartDate.getDate() + 45);

      await setDoc(doc(db, 'organisations', orgId), {
        registered_name: (firebaseUser.displayName || 'My') + ' Organisation',
        registration_number: 'PENDING',
        income_tax_no: 'PENDING',
        owner_email: firebaseUser.email,
        business_address: 'PENDING',
        tel_work: 'PENDING',
        industry: 'Other',
        status: 'active',
        createdAt: serverTimestamp(),
        // Legacy & Subscription
        name: (firebaseUser.displayName || 'My') + ' Organisation',
        email: firebaseUser.email,
        trialStartDate: trialStartDate.toISOString(),
        trialEndDate: trialEndDate.toISOString(),
        subscriptionStatus: 'trialing',
        subscriptionPlan: 'basic',
        uifPercentage: 1,
      });

      // Add as first member
      await setDoc(doc(db, `organisations/${orgId}/members`, firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: 'admin',
        joinedAt: new Date().toISOString()
      });

      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || 'User',
        role: 'admin',
        orgId: orgId,
        createdAt: new Date().toISOString(),
      };
      await setDoc(profileRef, newProfile);
      return newProfile;
    }
    return profileSnap.data() as UserProfile;
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      localStorage.setItem('isAuthenticated', 'true');
      await createInitialProfile(result.user);
    } catch (error) {
      handleAuthError(error);
    }
  };

  const login = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      localStorage.setItem('isAuthenticated', 'true');
    } catch (error) {
      handleAuthError(error);
    }
  };

  const signUp = async (email: string, pass: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      localStorage.setItem('isAuthenticated', 'true');
      await createInitialProfile(result.user);
    } catch (error) {
      handleAuthError(error);
    }
  };

  const logout = async () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('activeOrgId');
    await signOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        localStorage.setItem('isAuthenticated', 'true');
        let profileDone = false;
        let orgsDone = false;
        let attempts = 0;
        const maxAttempts = 1; // Only try once to avoid endless loops

        const checkDone = () => {
          if (profileDone && orgsDone) {
            setLoading(false);
          }
        };

        // Safety Timeout: Force loading to false after 6 seconds to prevent being stuck on landing page
        const timeoutId = setTimeout(() => {
          if (loading) {
            console.warn("Auth loading timed out. Forcing ready state.");
            setLoading(false);
          }
        }, 6000);

        // Fetch User Profile
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const unsubProfile = onSnapshot(profileRef, async (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
            profileDone = true;
            checkDone();
          } else {
            // If profile document missing but authenticated, create it
            console.log("Profile document missing for user, creating...");
            try {
              const newProfile = await createInitialProfile(firebaseUser);
              setProfile(newProfile);
            } catch (err) {
              console.error("Failed to create missing profile:", err);
            } finally {
              profileDone = true;
              checkDone();
            }
          }
        });

        // Fetch all organisations where user is a member
        const q = query(collectionGroup(db, 'members'), where('uid', '==', firebaseUser.uid));
        const unsubOrgs = onSnapshot(q, async (snap) => {
          const orgsMap = new Map<string, Organisation>();
          
          const fetchPromises = snap.docs.map(async (memberDoc) => {
            const orgId = memberDoc.ref.parent.parent?.id;
            if (orgId && !orgsMap.has(orgId)) {
              const orgSnap = await getDoc(doc(db, 'organisations', orgId));
              if (orgSnap.exists()) {
                orgsMap.set(orgId, { id: orgSnap.id, ...orgSnap.data() } as Organisation);
              }
            }
          });

          await Promise.all(fetchPromises);

          if (IS_DEMO_MODE) {
            const demo1 = { 
              id: 'demo_1', 
              isDemo: true, 
              name: 'Demo Ops Ltd', 
              registered_name: 'Demo Ops Ltd', 
              owner_email: firebaseUser.email, 
              status: 'active', 
              subscriptionPlan: 'unlimited' as const, 
              createdAt: new Date().toISOString(), 
              registration_number: 'DEMO-1', 
              income_tax_no: 'DEMO-1', 
              industry: 'Logistics', 
              business_address: 'Demo Address', 
              tel_work: '0000000000', 
              subscriptionStatus: 'active' as const 
            } as Organisation;
            orgsMap.set(demo1.id, demo1);
          }

          const orgs = Array.from(orgsMap.values());
          setUserOrganisations(orgs);

          // Determine active organisation
          const savedOrgId = localStorage.getItem('activeOrgId');
          let activeOrg = orgs.find(o => o.id === savedOrgId) || orgs[0];
          
          if (!activeOrg && attempts < maxAttempts) {
            attempts++;
            console.log("No organization found for verified user, initializing default...");
            const newProfile = await createInitialProfile(firebaseUser);
            if (newProfile.orgId) {
              const orgSnap = await getDoc(doc(db, 'organisations', newProfile.orgId));
              if (orgSnap.exists()) {
                 activeOrg = { id: orgSnap.id, ...orgSnap.data() } as Organisation;
                 setUserOrganisations([activeOrg]);
              }
            }
          }

          if (activeOrg) {
            localStorage.setItem('activeOrgId', activeOrg.id);
            setOrganisation(activeOrg);
          }
          
          orgsDone = true;
          checkDone();
        }, (err) => {
          console.error("Organisation fetch error (possibly missing index):", err);
          const fallbackOrgs: Organisation[] = [];
          if (IS_DEMO_MODE) {
            fallbackOrgs.push(
              { id: 'demo_1', isDemo: true, name: 'Demo Ops Ltd', registered_name: 'Demo Ops Ltd', owner_email: firebaseUser.email, status: 'active', subscriptionPlan: 'unlimited', createdAt: new Date().toISOString(), registration_number: 'DEMO-1', income_tax_no: 'DEMO-1', industry: 'Logistics', business_address: 'Demo Address', tel_work: '0000000000' } as Organisation
            );
          }

          // If we have a profile with an orgId, try to pull that one directly to avoid collectionGroup index issues
          if (profile?.orgId) {
            getDoc(doc(db, 'organisations', profile.orgId)).then(orgSnap => {
              if (orgSnap.exists()) {
                const org = { id: orgSnap.id, ...orgSnap.data() } as Organisation;
                setUserOrganisations([...fallbackOrgs, org]);
                setOrganisation(org);
              } else {
                setUserOrganisations(fallbackOrgs);
                if (fallbackOrgs.length > 0) setOrganisation(fallbackOrgs[0]);
              }
              orgsDone = true;
              checkDone();
            }).catch(() => {
              setUserOrganisations(fallbackOrgs);
              if (fallbackOrgs.length > 0) setOrganisation(fallbackOrgs[0]);
              orgsDone = true;
              checkDone();
            });
          } else {
            setUserOrganisations(fallbackOrgs);
            if (fallbackOrgs.length > 0) setOrganisation(fallbackOrgs[0]);
            orgsDone = true;
            checkDone();
          }
        });

        return () => {
          clearTimeout(timeoutId);
          unsubProfile();
          unsubOrgs();
        };
      } else {
        setProfile(null);
        setOrganisation(null);
        setUserOrganisations([]);
        localStorage.removeItem('activeOrgId');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const switchOrganisation = async (orgId: string, providedOrg?: Organisation) => {
    // If org is provided directly (e.g. from creation), use it to avoid waiting for listener
    const org = providedOrg || userOrganisations.find(o => o.id === orgId);
    if (!org) {
      console.warn("Attempted to switch to non-existent organisation, setting ID for listener.");
      localStorage.setItem('activeOrgId', orgId);
      return;
    }
    
    if (org.id === organisation?.id) return;

    setIsSwitching(true);
    
    // 1. Data Cleansing
    setOrganisation(null);
    
    // 2. Persist new ID
    localStorage.setItem('activeOrgId', org.id);

    // 3. Short delay for transition - we don't setIsSwitching(false) here
    // because components (like Dashboard) will signify when they are ready
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 4. Update to new organisation
    setOrganisation(org);
  };

  const can = (permission: Permission) => {
    // 1. Force true for demo orgs
    if (organisation?.id?.startsWith('demo_')) return true; 

    // 2. Force true for specific super-admin email (case-insensitive)
    const adminEmail = 'orfansolutions@gmail.com';
    const currentEmail = user?.email?.toLowerCase();
    if (currentEmail === adminEmail) return true;

    // 3. Force true if user is the explicit owner of the organization
    if (organisation?.owner_email && currentEmail === organisation.owner_email.toLowerCase()) return true;
    
    // 4. Fallback to profile-based permissions
    if (!profile) return false;
    
    // Fallback to admin if role is missing but profile exists
    const role = profile.role || 'admin';
    return hasPermission(role, permission);
  };

  const isPro = organisation?.id?.startsWith('demo_') || 
                user?.email?.toLowerCase() === 'orfansolutions@gmail.com' ||
                organisation?.subscriptionPlan === 'basic' || 
                organisation?.subscriptionPlan === 'unlimited' || 
                organisation?.subscriptionPlan === 'pro' || 
                organisation?.subscriptionPlan === 'enterprise' ||
                !organisation?.subscriptionPlan; // Fallback to true if plan not yet assigned
  const isSubscriptionActive = organisation?.subscriptionStatus === 'active' || organisation?.subscriptionStatus === 'trialing';

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      organisation, 
      userOrganisations, 
      loading, 
      isSwitching,
      setIsSwitching,
      signInWithGoogle, 
      login, 
      signUp, 
      logout, 
      switchOrganisation,
      can,
      isPro,
      isSubscriptionActive
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
