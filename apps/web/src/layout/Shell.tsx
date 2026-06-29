import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, clearApiKey } from "../api/client";

const STATIC_TOP = [
  { to: "/dashboard", label: "Dashboard" },
];

const STATIC_BOTTOM = [
  { to: "/templates", label: "Templates" },
  { to: "/credentials", label: "Credentials" },
];

const CHANNEL_NAV = [
  { to: "/messages/sms", label: "SMS", channel: "sms" },
  { to: "/messages/email", label: "Email", channel: "email" },
  { to: "/messages/whatsapp", label: "WhatsApp", channel: "whatsapp" },
];

export function Shell() {
  const navigate = useNavigate();
  const [activeChannels, setActiveChannels] = useState<string[]>([]);

  useEffect(() => {
    api.credentials.list()
      .then(creds =>
        setActiveChannels([...new Set(creds.filter(c => c.status === "healthy").map(c => c.channel))])
      )
      .catch(() => {});
  }, []);

  function signOut() {
    clearApiKey();
    navigate("/login");
  }

  const activeChannelNav = CHANNEL_NAV.filter(c => activeChannels.includes(c.channel));

  return (
    <div className="shell">
      <header className="product-bar">
        <span className="brand">Qalisa</span>
        <button className="btn ghost sm" onClick={signOut}>Sign out</button>
      </header>

      <nav className="nav-tabs">
        {STATIC_TOP.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}>
            {n.label}
          </NavLink>
        ))}
        {activeChannelNav.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}>
            {n.label}
          </NavLink>
        ))}
        {STATIC_BOTTOM.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}>
            {n.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
