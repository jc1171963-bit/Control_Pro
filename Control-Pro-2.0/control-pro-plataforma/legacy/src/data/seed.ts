import type { AppData } from '../types';
export const initialData: AppData = {
 employees:[
  {id:'EMP-001',number:'1001',name:'Juan Pérez',branch:'Toluca',job:'Administración',active:true,joined:'12/02/2024'},
  {id:'EMP-002',number:'1002',name:'Rosario Ramírez',branch:'Toluca',job:'Enfermería',active:true,joined:'18/03/2023'},
  {id:'EMP-003',number:'1003',name:'Carlos Mendoza',branch:'Toluca',job:'Mantenimiento',active:true,joined:'05/07/2022'},
  {id:'EMP-004',number:'1004',name:'Ana López',branch:'Toluca',job:'Intendencia',active:true,joined:'21/01/2025'},
  {id:'EMP-005',number:'1005',name:'Luis Hernández',branch:'Toluca',job:'Seguridad',active:true,joined:'09/09/2021'},
  {id:'EMP-006',number:'1006',name:'María Torres',branch:'Toluca',job:'Enfermería',active:true,joined:'16/11/2023'},
  {id:'EMP-007',number:'2001',name:'Pedro García',branch:'Querétaro',job:'Almacén',active:true,joined:'03/06/2024'},
  {id:'EMP-008',number:'2002',name:'Fernanda Ruiz',branch:'Querétaro',job:'Administración',active:true,joined:'14/08/2022'},
  {id:'EMP-009',number:'2003',name:'Roberto Sánchez',branch:'Querétaro',job:'Mantenimiento',active:true,joined:'28/04/2020'},
  {id:'EMP-010',number:'3001',name:'Daniela Flores',branch:'Puebla',job:'Intendencia',active:true,joined:'19/02/2025'},
  {id:'EMP-011',number:'3002',name:'Miguel Castillo',branch:'Puebla',job:'Seguridad',active:true,joined:'11/12/2021'},
  {id:'EMP-012',number:'3003',name:'Laura Jiménez',branch:'Puebla',job:'Enfermería',active:true,joined:'30/05/2023'}
 ],
 products:[
  {id:'PR-001',sku:'BAT-001',name:'Bata blanca',category:'Batas',sizes:['XS','S','M','L','XL'],price:420,active:true,jobs:['Enfermería','Administración']},
  {id:'PR-002',sku:'BAT-002',name:'Bata de laboratorio',category:'Batas',sizes:['XS','S','M','L','XL'],price:510,active:true,jobs:['Enfermería']},
  {id:'PR-003',sku:'CAM-001',name:'Camisa de trabajo',category:'Prendas',sizes:['XS','S','M','L','XL','XXL'],price:280,active:true,jobs:['Mantenimiento','Seguridad','Almacén']},
  {id:'PR-004',sku:'PAN-001',name:'Pantalón de trabajo',category:'Prendas',sizes:['XS','S','M','L','XL','XXL'],price:320,active:true,jobs:['Mantenimiento','Seguridad','Almacén','Intendencia']},
  {id:'PR-005',sku:'POL-001',name:'Polo corporativa',category:'Prendas',sizes:['XS','S','M','L','XL'],price:250,active:true,jobs:['Administración','Intendencia']},
  {id:'PR-006',sku:'CHA-001',name:'Chaleco de seguridad',category:'Protección',sizes:['S','M','L','XL','XXL'],price:390,active:true,jobs:['Seguridad','Mantenimiento']},
  {id:'PR-007',sku:'BOT-001',name:'Botas de seguridad',category:'Calzado',sizes:['22','23','24','25','26','27','28','29','30'],price:790,active:true,jobs:['Seguridad','Mantenimiento','Almacén']},
  {id:'PR-008',sku:'ZAP-001',name:'Zapatos de enfermería',category:'Calzado',sizes:['22','23','24','25','26','27','28'],price:640,active:true,jobs:['Enfermería']},
  {id:'PR-009',sku:'GOR-001',name:'Gorra de trabajo',category:'Accesorios',sizes:['Unitalla'],price:120,active:true,jobs:['Mantenimiento','Seguridad','Intendencia']}
 ],
 orders:[
  {id:'PED-2026-001',branch:'Toluca',created:'20/10/2026',status:'En revisión',items:[{employeeId:'EMP-001',productId:'PR-005',size:'M',qty:2},{employeeId:'EMP-002',productId:'PR-002',size:'M',qty:1},{employeeId:'EMP-002',productId:'PR-008',size:'24',qty:1},{employeeId:'EMP-003',productId:'PR-003',size:'L',qty:2},{employeeId:'EMP-003',productId:'PR-007',size:'27',qty:1},{employeeId:'EMP-004',productId:'PR-005',size:'S',qty:2},{employeeId:'EMP-005',productId:'PR-006',size:'L',qty:1},{employeeId:'EMP-005',productId:'PR-007',size:'28',qty:1},{employeeId:'EMP-006',productId:'PR-002',size:'S',qty:1},{employeeId:'EMP-006',productId:'PR-008',size:'23',qty:1}],note:'Pedido de demostración para seis empleados.'},
  {id:'PED-2026-002',branch:'Querétaro',created:'14/10/2026',status:'Aprobado',items:[{employeeId:'EMP-007',productId:'PR-003',size:'M',qty:1},{employeeId:'EMP-008',productId:'PR-005',size:'S',qty:2}],note:'Reposición trimestral.',reviewer:'Gerente de ventas',inventoryId:'INV-2026-002'},
  {id:'PED-2026-003',branch:'Puebla',created:'10/10/2026',status:'En preparación',items:[{employeeId:'EMP-010',productId:'PR-005',size:'M',qty:2},{employeeId:'EMP-011',productId:'PR-006',size:'L',qty:1}],note:'Solicitud de sucursal.',reviewer:'Gerente de ventas',inventoryId:'INV-2026-003'},
  {id:'PED-2026-004',branch:'Toluca',created:'08/10/2026',status:'Completado',items:[{employeeId:'EMP-001',productId:'PR-005',size:'M',qty:1}],note:'Pedido cerrado.'}
 ],
 inventory:[{id:'INV-2026-002',orderId:'PED-2026-002',branch:'Querétaro',status:'Liberada para preparación',created:'14/10/2026'},{id:'INV-2026-003',orderId:'PED-2026-003',branch:'Puebla',status:'En preparación',created:'10/10/2026'}],
 packages:[{id:'PAQ-2026-001',orderId:'PED-2026-003',employeeIds:['EMP-010','EMP-011'],status:'En tránsito',carrier:'Transportes Castores',guide:'CAST-884120',tracking:['Guía registrada · 10/10/2026','En tránsito · 11/10/2026'],received:false}],
 deliveries:[{id:'ENT-001',orderId:'PED-2026-004',packageId:'PAQ-2026-000',employeeId:'EMP-001',status:'Entregado',signedAt:'09/10/2026 12:30',rating:5,note:'Entrega conforme.'}],
 incidents:[{id:'INC-2026-001',orderId:'PED-2026-003',employeeId:'EMP-010',packageId:'PAQ-2026-001',type:'Talla incorrecta',priority:'Media',status:'Abierta',description:'Validar talla de prenda recibida.',created:'12/10/2026'}],
 audit:[{id:'AUD-001',date:'20/10/2026 09:15',user:'Sistema',action:'Pedido creado',detail:'PED-2026-001 preparado para demostración'},{id:'AUD-002',date:'14/10/2026 11:20',user:'Gerente de ventas',action:'Pedido aprobado',detail:'PED-2026-002 · orden INV-2026-002 generada'},{id:'AUD-003',date:'12/10/2026 15:42',user:'Representante de sucursal',action:'Incidencia registrada',detail:'INC-2026-001'}],
 notifications:[{id:'NOT-001',text:'El pedido PED-2026-001 está pendiente de aprobación.',read:false,date:'20/10/2026'},{id:'NOT-002',text:'La incidencia INC-2026-001 requiere seguimiento.',read:false,date:'12/10/2026'},{id:'NOT-003',text:'El paquete PAQ-2026-001 está en tránsito.',read:true,date:'11/10/2026'}]
};
