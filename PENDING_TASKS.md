# Tareas pendientes

## Zona horaria del host

- [ ] Ejecutar en una terminal del servidor: `sudo timedatectl set-timezone America/Mexico_City`.
- [ ] Verificar con `timedatectl status` que muestre `Time zone: America/Mexico_City`.
- [x] Verificar aplicación: Node (`web`/`worker`) y PostgreSQL operan con `America/Mexico_City` aunque el comando BusyBox `date` de los contenedores muestre UTC.

## Preparar migracion a otra computadora o servidor

- [ ] Versionar y commitear todas las migraciones aplicadas (`039`, `041` a `049`; no existe `040`) junto con el codigo que depende de ellas.
- [ ] Revisar y corregir `db/backup/backup.sh`: permisos `umask 077`, respaldo de PostgreSQL, respaldo completo de MinIO y manejo seguro de secretos.
- [ ] Corregir `db/backup/restore.sh`: hacer accesible el dump dentro del contenedor, detener escrituras durante la restauracion y restaurar PostgreSQL + MinIO de forma reproducible.
- [ ] Ejecutar una prueba completa de respaldo y restauracion en una base/entorno temporal; documentar tiempos, comandos y resultado.
- [ ] Crear imagenes de produccion autonomas para `web` y `worker`, sin depender de los montajes `./web:/app` y `./worker:/app`.
- [ ] Ejecutar los contenedores como usuario no root y con filesystem/capacidades restringidos donde sea posible.
- [ ] Crear usuarios de PostgreSQL y credenciales de MinIO con privilegios limitados para la aplicacion; no usar las credenciales root en runtime.
- [ ] Documentar las variables obligatorias de `.env` y un procedimiento seguro para trasladarlas sin subir secretos a Git.
- [ ] Documentar la configuracion del nuevo servidor: `APP_BASE_URL`, `TAILSCALE_IP`, puertos, DNS/dominio, SMTP y almacenamiento.
- [ ] Verificar compatibilidad de arquitectura del nuevo equipo (`amd64`/`arm64`) y reconstruir las imagenes en destino.
- [ ] Preparar un checklist de validacion posterior: web, API, migraciones, datos, adjuntos MinIO, worker, correo, Tailscale y respaldos.
- [ ] Definir plan de corte y rollback antes de la migracion definitiva.

### Criterio de salida

La aplicacion se considera lista para migrar cuando un equipo limpio pueda recibir repositorio + `.env` + respaldos, ejecutar Docker Compose, restaurar PostgreSQL y MinIO, y pasar el checklist sin ajustes manuales no documentados.
