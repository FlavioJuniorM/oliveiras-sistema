import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { RotaProtegida } from "./components/RotaProtegida";
import { AppLayout } from "./components/layout/AppLayout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { NovoPedido } from "./pages/pedidos/NovoPedido";
import { PedidosDoDia } from "./pages/pedidos/PedidosDoDia";
import { Clientes } from "./pages/clientes/Clientes";
import { Produtos } from "./pages/produtos/Produtos";
import { ContasReceber } from "./pages/financeiro/ContasReceber";
import { ContasPagar } from "./pages/financeiro/ContasPagar";
import { Relatorios } from "./pages/relatorios/Relatorios";
import { Usuarios } from "./pages/usuarios/Usuarios";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <RotaProtegida>
              <AppLayout />
            </RotaProtegida>
          }
        >
          <Route
            path="/"
            element={
              <RotaProtegida somenteAdmin>
                <Dashboard />
              </RotaProtegida>
            }
          />
          <Route path="/pedidos/novo" element={<NovoPedido />} />
          <Route path="/pedidos" element={<PedidosDoDia />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route
            path="/financeiro/contas-a-receber"
            element={
              <RotaProtegida somenteAdmin>
                <ContasReceber />
              </RotaProtegida>
            }
          />
          <Route
            path="/financeiro/contas-a-pagar"
            element={
              <RotaProtegida somenteAdmin>
                <ContasPagar />
              </RotaProtegida>
            }
          />
          <Route
            path="/relatorios"
            element={
              <RotaProtegida somenteAdmin>
                <Relatorios />
              </RotaProtegida>
            }
          />
          <Route
            path="/usuarios"
            element={
              <RotaProtegida somenteAdmin>
                <Usuarios />
              </RotaProtegida>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
