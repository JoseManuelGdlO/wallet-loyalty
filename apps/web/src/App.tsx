import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { BusinessesPage, CustomerDetailPage, CustomersPage, ProgramsPage, RewardsPage } from "@/pages/manage";
import { DashboardPage } from "@/pages/dashboard";
import { LoginPage } from "@/pages/login";
import { PublicBusinessPage, PublicCardPage } from "@/pages/public";
import { ScannerPage } from "@/pages/scanner";
import { Shell } from "@/shell";

function CustomerRoute() {
  const { id = "" } = useParams();
  return <CustomerDetailPage id={id} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/c/:slug" element={<PublicBusinessPage />} />
      <Route path="/t/:token" element={<PublicCardPage />} />
      <Route path="/app" element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="negocios" element={<BusinessesPage />} />
        <Route path="programas" element={<ProgramsPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="clientes/:id" element={<CustomerRoute />} />
        <Route path="escaner" element={<ScannerPage />} />
        <Route path="canjes" element={<RewardsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
