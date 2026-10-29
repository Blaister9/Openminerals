type UpdateNotice={pending:boolean;embedded:boolean;updateId?:string|null;reason?:string};

// A negative SDK check can mean a rejected or failed revision, not necessarily
// that this session is running the newest published bundle.
export function updateCheckNotice({pending,embedded,updateId,reason}:UpdateNotice){
  if(pending)return 'Actualización descargada. Cierra completamente y vuelve a abrir la app para aplicarla; tus datos se conservan.';
  if(reason==='updatePreviouslyFailed')return 'La actualización disponible no pudo iniciar. Se conserva la versión que funcionaba; puedes seguir usando la app.';
  if(reason==='rollbackNoEmbeddedConfiguration')return 'No se pudo preparar la recuperación de versión. Se conserva la sesión actual.';
  if(embedded)return 'Esta sesión usa la versión incluida en el APK. La comprobación no encontró otra actualización aplicable.';
  const id=typeof updateId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(updateId)?updateId.slice(0,8):'remota';
  return `Comprobación terminada. Esta sesión usa la actualización ${id}.`;
}
