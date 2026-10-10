import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
const Login = React.lazy(() => import('./pages/Login.jsx'));
import WebsitePage from './pages/WebsitePage.jsx';
import SectionWorkspace from './components/SectionWorkspace.jsx';
import './website.css';
const Dashboard = React.lazy(() => import('./pages/Dashboard.jsx'));
const Consultancy = React.lazy(() => import('./pages/Consultancy.jsx'));
const StudentsPage = React.lazy(() => import('./pages/StudentsPage.jsx'));
const Admissions = React.lazy(() => import('./pages/Admissions.jsx'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage.jsx'));
const Reception = React.lazy(() => import('./pages/Reception.jsx'));
const HR = React.lazy(() => import('./pages/HR.jsx'));
const Finance = React.lazy(() => import('./pages/Finance.jsx'));
const ActivityPage = React.lazy(() => import('./pages/ActivityPage.jsx'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage.jsx'));
const TasksPage = React.lazy(() => import('./pages/TasksPage.jsx'));
const InboxPage = React.lazy(() => import('./pages/InboxPage.jsx'));
const UniversitiesPage = React.lazy(() => import('./pages/UniversitiesPage.jsx'));
const ProgramsCatalogPage = React.lazy(() => import('./pages/ProgramsCatalogPage.jsx'));
const ScholarshipsPage = React.lazy(() => import('./pages/ScholarshipsPage.jsx'));
const EducationCatalogAdminPage = React.lazy(() => import('./pages/EducationCatalogAdminPage.jsx'));
const RemindersPage = React.lazy(() => import('./pages/RemindersPage.jsx'));
const CallsSchedulePage = React.lazy(() => import('./pages/CallsSchedulePage.jsx'));
const ScriptsLibraryPage = React.lazy(() => import('./pages/ScriptsLibraryPage.jsx'));
const DailyReportPage = React.lazy(() => import('./pages/DailyReportPage.jsx'));
const LeaveManagementPage = React.lazy(() => import('./pages/LeaveManagementPage.jsx'));
const SalesPortalPage = React.lazy(() => import('./pages/SalesPortalPage.jsx'));
import { canOpenModule } from './permissions.js';

function Guard({ module, children }) {
  const { user } = useAuth();
  return canOpenModule(user, module) ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const homeElement = user.role === 'reception'
    ? <Navigate to="/reception" replace />
    : user.role === 'finance'
      ? <Navigate to="/finance" replace />
      : user.role === 'hr'
        ? <Navigate to="/hr" replace />
      : <Dashboard />;

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={homeElement} />
        <Route path="consultancy" element={<Guard module="consultancy"><SectionWorkspace module="consultancy"><Consultancy /></SectionWorkspace></Guard>} />
        <Route path="students" element={<Guard module="students"><SectionWorkspace module="students"><StudentsPage /></SectionWorkspace></Guard>} />
        <Route path="admissions" element={<Guard module="admissions"><SectionWorkspace module="admissions"><Admissions /></SectionWorkspace></Guard>} />
        <Route path="inbox" element={<Guard module="inbox"><SectionWorkspace module="inbox"><InboxPage /></SectionWorkspace></Guard>} />
        <Route path="reports" element={<Guard module="reports"><ReportsPage /></Guard>} />
        <Route path="tasks" element={<Guard module="tasks"><TasksPage /></Guard>} />
        <Route path="reminders" element={<Guard module="reminders"><RemindersPage /></Guard>} />
        <Route path="calls" element={<Guard module="calls"><CallsSchedulePage /></Guard>} />
        <Route path="scripts" element={<Guard module="scripts"><ScriptsLibraryPage /></Guard>} />
        <Route path="daily-report" element={<Guard module="dailyReport"><DailyReportPage /></Guard>} />
        <Route path="leave" element={<Guard module="leave"><LeaveManagementPage /></Guard>} />
        <Route path="sales" element={<Guard module="sales"><SalesPortalPage /></Guard>} />
        <Route path="reception" element={<Guard module="reception"><SectionWorkspace module="reception"><Reception /></SectionWorkspace></Guard>} />
        <Route path="hr" element={<Guard module="hr"><SectionWorkspace module="hr"><HR /></SectionWorkspace></Guard>} />
        <Route path="finance" element={<Guard module="finance"><SectionWorkspace module="finance"><Finance /></SectionWorkspace></Guard>} />
        <Route path="activity" element={<Guard module="activity"><ActivityPage /></Guard>} />
        <Route path="countries" element={<Guard module="catalogManagement"><WebsitePage embedded resources={["countries"]}/></Guard>} />
        <Route path="university-management" element={<Guard module="universities"><WebsitePage embedded resources={["universities"]}/></Guard>} />
        <Route path="universities" element={<Guard module="universities"><SectionWorkspace module="universities"><UniversitiesPage /></SectionWorkspace></Guard>} />
        <Route path="programs" element={<Guard module="programs"><SectionWorkspace module="programs"><ProgramsCatalogPage /></SectionWorkspace></Guard>} />
        <Route path="scholarships" element={<Guard module="scholarships"><SectionWorkspace module="scholarships"><ScholarshipsPage /></SectionWorkspace></Guard>} />
        <Route path="catalog-management" element={<Guard module="catalogManagement"><SectionWorkspace module="catalogManagement"><EducationCatalogAdminPage /></SectionWorkspace></Guard>} />
        <Route path="services" element={<Guard module="services"><SectionWorkspace module="services" /></Guard>} />
        <Route path="partners" element={<Guard module="partners"><SectionWorkspace module="partners" /></Guard>} />
        <Route path="content" element={<Guard module="content"><SectionWorkspace module="content" /></Guard>} />
        <Route path="website" element={<Guard module="website"><WebsitePage /></Guard>} />
        <Route path="settings" element={<Guard module="settings"><SectionWorkspace module="settings"><SettingsPage /></SectionWorkspace></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App(){return <React.Suspense fallback={<div role="status" className="page-loading">جارٍ تحميل القسم...</div>}><AppRoutes /></React.Suspense>;}
