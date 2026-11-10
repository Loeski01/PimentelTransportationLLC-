# Pimentel Driver — punto de reanudación solicitado (9 noviembre 2026, 11:59 p. m. ET)

Este documento registra el estado conocido para retomar el trabajo; no certifica que un proceso haya continuado hasta las 11:59.

## Estado confirmado
- Proyecto: Pimentel Transportation LLC, aplicación Pimentel Driver / despacho.
- Repositorio: Loeski01/PimentelTransportationLLC-
- Rama de trabajo: feature/dispatch-test-cleanup-preview-20261109
- Herramienta de verificación: scripts/verify-dispatch-backup.sh, commit b7ae262359b94429f2fddda0d96a6ee20aa1505d.
- Render: workspace tea-dbec85m7bikc73fvfb7g; base PostgreSQL 18 pimentel-dispatch-dev, instancia dpg-dbggc7ei0phs73du2q10-a.
- Respaldo aportado en la conversación: 2026-11-10T03_10Z.dir.gz, archivo tar.gz con directorio de respaldo PostgreSQL, toc.dat y 12 archivos de datos. No guardar el respaldo ni credenciales en GitHub.
- Restauración PostgreSQL **NO VERIFICADA**. El entorno de ejecución usado no dispone de pg_restore/PostgreSQL; conexión externa a Render bloqueada por lista IP.
- Limpieza **NO REALIZADA**. El usuario autorizó eliminar 9 viajes y 2 conductores ficticios de la base de desarrollo, manteniendo cuenta de administrador, configuración y funciones.
- No se han publicado los cambios de esta rama ni se ha realizado limpieza de la base.

## Próximo paso obligatorio
1. Preparar PostgreSQL 18 aislado, con transferencia privada del respaldo (no al repositorio público).
2. Ejecutar pg_restore sobre la carpeta que contiene toc.dat; comprobar conteos y funcionalidad.
3. Solo tras verificación, hacer copia de seguridad reciente y limpiar datos ficticios en desarrollo con operación revisada y reversible.
4. Probar administrador, viajes, asignación manual, estados, PIN y notificaciones; publicar solo tras validación.

## Precauciones
- No afirmar que se restauró ni que se limpió hasta contar con resultados.
- No exponer contraseñas, datos de respaldo o conexiones públicas.
- Este checkpoint es una nota de continuidad, no una tarea programada ni una restauración en curso.
