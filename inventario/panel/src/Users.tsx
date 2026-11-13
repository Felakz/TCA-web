import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { InternalClient, ManagedUser, Role } from './client';
const roles: Role[] = ['SIN_ASIGNAR','GERENCIA','VENTAS','ALMACEN','CLIENTE'];
export function Users({ client }: { client: InternalClient }) {
 const [users, setUsers] = useState<ManagedUser[]>([]);
 const [email,setEmail] = useState(''); const [password,setPassword] = useState(''); const [role,setRole] = useState<Role>('SIN_ASIGNAR');
 const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false); const active = useRef(false); const locked=useRef(false);
 async function refresh() { const result = await client.users(); if (!active.current) return; if (result.error) setMessage(result.error.message); else setUsers(result.data); }
 useEffect(() => { active.current=true; void refresh(); return () => { active.current=false; }; },[client]);
 async function create(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (locked.current) return; locked.current=true; setBusy(true);
  try { const result = await client.createUser({email,password,rol:role}); if (!active.current) return; setPassword(''); setMessage(result.error?.message ?? 'Cuenta creada.'); if (!result.error) { setEmail(''); await refresh(); } }
  finally { locked.current=false; if (active.current) setBusy(false); }
 }
 return <section><h2>Usuarios autorizados</h2><p>Los cambios de rol o habilitación cierran las sesiones de la cuenta afectada.</p><p role="status">{message}</p><button onClick={() => { void refresh(); }}>Actualizar usuarios</button>
 <form onSubmit={create}><fieldset disabled={busy}><label>Correo de nueva cuenta<input type="email" required autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Contraseña inicial<input type="password" required minLength={12} maxLength={1024} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} /></label><label>Rol de nueva cuenta<select value={role} onChange={e=>setRole(e.target.value as Role)}>{roles.map(r=><option key={r}>{r}</option>)}</select></label><button>Crear cuenta</button></fieldset></form>
 {users.map(u=><UserEditor key={`${u.id}:${u.rol}:${u.habilitado}`} user={u} client={client} refresh={refresh} />)}</section>;
}
function UserEditor({user,client,refresh}: {user:ManagedUser;client:InternalClient;refresh:()=>Promise<void>}) {
 const [role,setRole]=useState(user.rol); const [enabled,setEnabled]=useState(Boolean(user.habilitado)); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false); const locked=useRef(false);
 async function save(e:FormEvent<HTMLFormElement>) { e.preventDefault(); if(locked.current)return; locked.current=true;setBusy(true); try { const result=await client.updateUser({id:user.id,rol:role,habilitado:enabled});setMessage(result.error?.message??'Permisos guardados.');if(!result.error)await refresh(); } finally {locked.current=false;setBusy(false);} }
 return <form onSubmit={save}><h3>{user.email}</h3><fieldset disabled={busy}><label>Rol de {user.email}<select value={role} onChange={e=>setRole(e.target.value as Role)}>{roles.map(r=><option key={r}>{r}</option>)}</select></label><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} />Habilitar {user.email}</label><button>Guardar permisos de {user.email}</button></fieldset><p role="status">{message}</p></form>;
}
