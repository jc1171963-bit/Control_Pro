import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, ClipboardList, Heart, LogOut, MapPin, PlusCircle, User } from 'lucide-react';
import { get } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { cls } from '../../lib/formato';

export default function CuentaLayout() {
  const { cliente, salir } = useAuth();
  const notif = useQuery({ queryKey: ['notif-cliente'], queryFn: () => get('/cuenta/notificaciones?por_pagina=1'), refetchInterval: 60_000 });
  const enlaces: [string, string, typeof Bell][] = [
    ['pedidos', 'Mis pedidos', ClipboardList], ['notificaciones', 'Notificaciones', Bell], ['direcciones', 'Direcciones', MapPin],
    ['favoritos', 'Favoritos', Heart], ['perfil', 'Perfil y seguridad', User],
    ...(cliente?.tipo === 'empresa' ? [['empleados', 'Empleados', Building2], ['corporativo/nuevo', 'Nuevo pedido corporativo', PlusCircle]] as [string, string, typeof Bell][] : []),
  ];
  return (
    <div className="contenedor grid gap-8 py-8 lg:grid-cols-[240px_1fr]">
      <aside>
        <div className="rounded-2xl bg-tinta-900 p-5 text-white">
          <p className="text-xs uppercase tracking-widest text-menta-300">{cliente?.tipo === 'empresa' ? 'Cuenta corporativa' : 'Mi cuenta'}</p>
          <p className="mt-1 font-display text-lg font-bold leading-tight">{cliente?.razon_social || cliente?.nombre}</p>
          <p className="truncate text-xs text-tinta-300">{cliente?.correo}</p>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto lg:flex-col">
          {enlaces.map(([to, n, Icono]) => (
            <NavLink key={to} to={to} className={({ isActive }) => cls('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold', isActive ? 'bg-white text-tinta-900 shadow-sm ring-1 ring-arena-200' : 'text-tinta-600 hover:bg-arena-200')}>
              <Icono className="h-4 w-4" />{n}
              {to === 'notificaciones' && !!notif.data?.no_leidas && <span className="ml-auto rounded-full bg-coral-500 px-1.5 text-[11px] text-white">{notif.data.no_leidas}</span>}
            </NavLink>
          ))}
          <button onClick={salir} className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-coral-600 hover:bg-coral-50"><LogOut className="h-4 w-4" />Cerrar sesión</button>
        </nav>
      </aside>
      <section className="min-w-0"><Outlet /></section>
    </div>
  );
}
