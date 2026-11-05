# Security Specification: Gestor de Cuadrante y Auditor de Jornada SAS

## 1. Data Invariants

1. **User Ownership Invariant**: Cada usuario únicamente puede leer, crear y actualizar su propio perfil en `/users/{userId}` y sus propios datos de cuadrante en `/users/{userId}/data/{docId}`. Ningún usuario puede acceder a los datos de otro profesional sanitario.
2. **Identity Immutability**: El campo `userId` en cualquier documento debe coincidir estrictamente con `request.auth.uid` y no puede ser alterado tras la creación.
3. **No Unauthenticated Access**: Todas las operaciones de lectura y escritura requieren obligatoriamente `request.auth != null`.
4. **Relational Scope**: Las subcolecciones `/users/{userId}/data/{docId}` están acotadas bajo el UID del usuario autenticado; el comodín `{userId}` debe ser validado contra `request.auth.uid`.

## 2. The "Dirty Dozen" Threat Payloads

1. **Unauthenticated Read User Profile**: Lectura anónima de `/users/someUser123` -> PERMISSION_DENIED.
2. **Unauthenticated Read Cuadrante**: Lectura anónima de `/users/someUser123/data/cuadrante` -> PERMISSION_DENIED.
3. **Cross-User Profile Read**: Usuario A (UID `userA`) intenta leer `/users/userB` -> PERMISSION_DENIED.
4. **Cross-User Cuadrante Read**: Usuario A (UID `userA`) intenta leer `/users/userB/data/cuadrante` -> PERMISSION_DENIED.
5. **Cross-User Profile Write**: Usuario A intenta escribir en `/users/userB` con `userId: 'userB'` -> PERMISSION_DENIED.
6. **Cross-User Cuadrante Write**: Usuario A intenta escribir en `/users/userB/data/cuadrante` con `userId: 'userA'` o `userB` -> PERMISSION_DENIED.
7. **Identity Spoofing on Profile Create**: Usuario A escribe en `/users/userA` con `userId: 'userB'` en el body -> PERMISSION_DENIED.
8. **Identity Poisoning on Update**: Usuario A intenta mutar el campo inmutable `userId` en `/users/userA` -> PERMISSION_DENIED.
9. **Junk Path Injection**: Inyección de caracteres no alfanuméricos en `{userId}` o `{docId}` -> PERMISSION_DENIED.
10. **Shadow Key Injection on Profile**: Inyección de claves no autorizadas (ej. `isAdmin: true` o `role: superuser`) en `UserProfile` -> PERMISSION_DENIED.
11. **Negative Hours Poisoning**: Inserción de `baseHours: -500` en `CuadranteData` -> PERMISSION_DENIED.
12. **Global Catch-All Default Deny**: Intento de acceso a `/admins/hacked` o cualquier colección no especificada -> PERMISSION_DENIED.

## 3. Test Runner Specification

All tests assert that unauthorized reads and writes produce `PERMISSION_DENIED`.
Rules are drafted under `rules_version = '2'` with strict ABAC rules.
