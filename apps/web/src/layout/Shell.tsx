import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearApiKey } from "../api/client";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/credentials", label: "Credentials" },
  { to: "/messages", label: "Messages" },
  { to: "/templates", label: "Templates" },
];

export function Shell() {
  const navigate = useNavigate();

  function signOut() {
    clearApiKey();
    navigate("/login");
  }

  return (
    <div className="shell">
      <header className="product-bar">
        <span className="brand">Qalisa</span>
        <button className="btn ghost sm" onClick={signOut}>Sign out</button>
      </header>

      <nav className="nav-tabs">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
