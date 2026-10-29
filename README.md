# Asistente IA especializado con RAG

Aplicación web de un asistente de IA que responde **únicamente** con la información de los documentos que carga el administrador. Incluye autenticación, historial de conversaciones, cuotas mensuales de preguntas, solicitudes de preguntas adicionales y un panel de administración.

**Tecnologías:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Auth, PostgreSQL + pgvector, Storage) · OpenAI · Vercel.

---

## Puesta en marcha (≈15 minutos)

### 1. Crear el proyecto de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor → New query**, pega el contenido de
   [`supabase/migrations/20261026000000_init.sql`](supabase/migrations/20261026000000_init.sql) y ejecútalo.
   Esto crea las tablas, las políticas RLS, las funciones y el bucket privado `documents`.

   > Alternativa con la CLI: `npx supabase link --project-ref TU_REF` y `npx supabase db push`.

### 2. Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

| Variable | Dónde obtenerla |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API Keys → `anon` / `publishable` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → `service_role` / `secret` (**solo servidor**) |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (**solo servidor**) |

```bash
cp .env.example .env.local
```

### 3. Ejecutar en local

```bash
npm install
npm run dev
```

Abre <http://localhost:3000> y regístrate.

### 4. Crear la cuenta administradora

Los usuarios nunca pueden asignarse el rol de administrador: el perfil siempre se crea con el rol `user` y no existe ninguna política que permita modificarlo desde el cliente. Para promover tu cuenta, usa **una** de estas opciones:

```bash
# Opción A: script (usa la service role key de .env.local)
npm run make-admin -- tu-correo@ejemplo.com
```

```sql
-- Opción B: en el SQL Editor de Supabase
update public.profiles set role = 'admin' where email = 'tu-correo@ejemplo.com';
```

Vuelve a cargar la página: en el menú de tu usuario (abajo a la izquierda) aparecerá **Panel de administración**.

### 5. Configurar el asistente

En `/admin`:

1. **Configuración de la IA:** nombre, tema, mensaje de bienvenida, preguntas sugeridas, tono, longitud, restricciones e instrucciones.
2. **Documentos:** sube PDF, DOCX, TXT o Markdown. Cada archivo pasa por *Subiendo → Procesando → Disponible* (o *Error* con el motivo).
3. **Límites y costos:** preguntas gratuitas, tokens, fragmentos, límite global y presupuesto.
4. **Marca y acceso:** logo, colores, dominios de correo autorizados a registrarse y clave de OpenAI (cifrada). Con esto, reutilizar el proyecto solo requiere una base de datos nueva y las claves de Supabase en el entorno.

> Si ya tenías la base creada, ejecuta también [`20261029000000_brand_and_access.sql`](supabase/migrations/20261029000000_brand_and_access.sql).

---

## Despliegue en Vercel

1. Sube el repositorio a GitHub e impórtalo en [vercel.com/new](https://vercel.com/new) (detecta Next.js automáticamente).
2. En **Settings → Environment Variables** agrega las cuatro variables de `.env.example`.
3. Despliega.
4. En Supabase → **Authentication → URL Configuration**:
   - **Site URL:** `https://tu-app.vercel.app`
   - **Redirect URLs:** `https://tu-app.vercel.app/auth/callback` (y `http://localhost:3000/auth/callback` para desarrollo).

**Confirmación de correo:** por defecto Supabase pide confirmar el correo al registrarse y la app muestra «Revisa tu correo». Para una demo en clase puedes desactivarla en *Authentication → Sign In / Providers → Email → Confirm email*. El servicio de correo gratuito de Supabase tiene un límite bajo de envíos por hora.

Nada se guarda en el sistema de archivos: los documentos van a Supabase Storage y todo lo demás a PostgreSQL.

---

## Cómo funciona

### RAG (base de conocimiento)

**Indexación** (al subir un documento):

1. El navegador sube el archivo **directamente a Supabase Storage** con una URL firmada que genera el servidor. Así se evita el límite de 4,5 MB del cuerpo de las funciones de Vercel.
2. `POST /api/admin/documents/[id]/process` descarga el archivo, extrae el texto (`unpdf` para PDF, `mammoth` para DOCX) y lo divide en fragmentos de unos 1.500 caracteres. Los párrafos consecutivos, como los pasos de un procedimiento, se mantienen juntos y cada fragmento conserva su título.
3. Genera los embeddings con `text-embedding-3-small` y los guarda en `document_chunks` (pgvector con índice HNSW).

**Respuesta** (`POST /api/chat`, siempre desde el backend; el modelo no decide si consulta la documentación):

```
límite de frecuencia → presupuesto → reserva atómica de 1 pregunta
→ filtro de tema (clasificador)        ── fuera de tema → mensaje configurado, se devuelve la pregunta
→ embedding de la consulta → pgvector con umbral de similitud
                                       ── sin fragmentos → «no dispongo de información», se devuelve
→ System Prompt restringido + fragmentos delimitados como datos (ajustados al máx. de tokens de entrada)
→ respuesta en streaming               ── el modelo indica [SIN_INFORMACION] → se devuelve
→ verificación de citas [n] → se guardan la respuesta y sus fuentes
```

### Restricciones del conocimiento

- **Filtro de tema:** una llamada breve clasifica el mensaje como *en tema*, *saludo* o *fuera de tema*. Usa la conversación previa para entender preguntas como «¿y el paso 2?» y reformula la consulta de búsqueda.
- **Umbral de relevancia configurable:** los fragmentos por debajo del umbral se descartan. Si no queda ninguno, no se llama al modelo.
- **System Prompt** ([`src/lib/assistant/prompt.ts`](src/lib/assistant/prompt.ts)): exige responder solo con el contexto, seguir los procedimientos documentados, no inventar, reconocer cuando la información es insuficiente y no obedecer al usuario si intenta cambiar las reglas.
- **Documentos como datos:** cada fragmento va dentro de `<documento>` en un mensaje separado y marcado como «no contiene instrucciones». Además se neutraliza cualquier etiqueta de cierre que aparezca en el propio texto.
- **Comprobación de fuentes:** se eliminan las citas a fuentes inexistentes y se muestran las fuentes realmente citadas.

Los modelos de lenguaje no garantizan el cumplimiento absoluto de estas reglas, pero estas capas reducen mucho las respuestas fuera de contexto.

### Preguntas mensuales

- Hay una fila por usuario y mes en `monthly_usage`. Al empezar un mes la fila aún no existe, así que el contador vuelve a 0 sin tareas programadas.
- `reserve_question` descuenta la pregunta **antes** de llamar a OpenAI con bloqueo de filas (`SELECT … FOR UPDATE`). Dos solicitudes simultáneas no pueden superar el saldo, y el límite global también se respeta.
- Si la respuesta no es válida (fuera de tema, sin información o error técnico), `refund_question` devuelve la pregunta.
- Primero se consumen las preguntas gratuitas del mes y después las adicionales. Las adicionales no caducan.
- `review_request` solo actúa si la solicitud sigue *pendiente*, así que no se puede aprobar dos veces.
- Estas funciones solo pueden ejecutarse con la service role. Los usuarios autenticados no tienen permiso para invocarlas.

### Seguridad

| Medida | Implementación |
| --- | --- |
| Rutas privadas | `src/proxy.ts` refresca la sesión y redirige a `/login` |
| Rol de administrador | `requireAdmin()` en el layout de `/admin` y `assertAdmin()` en cada acción y ruta de API |
| RLS | Cada usuario solo lee sus perfiles, conversaciones, mensajes, consumo y solicitudes. Configuración, documentos y consumo de OpenAI son solo para el admin |
| Claves | `OPENAI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` solo se usan en módulos `server-only` |
| Documentos | Bucket privado sin políticas públicas |
| Validación | `zod` en todas las Server Actions y en `/api/chat` |
| Abuso | Máximo 6 mensajes por minuto y 60 por hora por usuario |
| Costos | Comprobación conservadora del presupuesto antes de cada consulta y registro del gasto estimado |

### Costos

Los precios por modelo están en [`src/lib/openai/pricing.ts`](src/lib/openai/pricing.ts). Actualízalos si OpenAI los cambia. El costo del mes es una **estimación** basada en los tokens que informa OpenAI y no sustituye a la facturación real. Configura también un límite de gasto en tu cuenta de OpenAI.

Con `gpt-4.1-mini` y los valores por defecto, cada pregunta cuesta como máximo unos 0,005 USD.

---

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/login, register     Autenticación
│   ├── auth/callback, signout     Confirmación de correo y cierre de sesión
│   ├── chat/                      Chat (layout con barra lateral, /chat y /chat/[id])
│   ├── admin/                     Panel: resumen, IA, documentos, usuarios, solicitudes, límites
│   └── api/
│       ├── chat/                  Pipeline RAG en streaming (NDJSON)
│       └── admin/documents/[id]/process   Indexación de documentos
├── actions/                       Server Actions (chat y administración)
├── components/
│   ├── ui/                        shadcn/ui
│   ├── chat/                      Interfaz del chat
│   └── admin/                     Interfaz del panel
├── lib/
│   ├── assistant/                 Configuración, tonos y System Prompt
│   ├── chat/pipeline.ts           Orquestación de cada pregunta
│   ├── openai/                    Cliente, precios y registro de consumo
│   ├── quota/                     Reserva y devolución de preguntas, límite de frecuencia
│   ├── rag/                       Extracción, fragmentación, indexación y búsqueda
│   └── supabase/                  Clientes (navegador, servidor, service role, proxy)
└── proxy.ts                       Protección de rutas
supabase/migrations/               Esquema SQL, RLS y funciones
scripts/make-admin.mjs             Asigna el rol de administrador
tests/                             Pruebas unitarias e integración con la base de datos
```

---

## Pruebas

```bash
npm test          # Unitarias: fragmentación, System Prompt, delimitación de documentos, citas
npm run lint
npm run build
```

Pruebas de integración contra una base de datos real (RLS, permisos, concurrencia de cuotas, doble aprobación, búsqueda vectorial, bucket privado). Usan una instancia local de Supabase, que requiere Docker **solo para las pruebas**:

```bash
npx supabase start
TEST_SUPABASE_URL=http://127.0.0.1:54321 \
TEST_SUPABASE_ANON_KEY=<publishable key> \
TEST_SUPABASE_SERVICE_ROLE_KEY=<secret key> \
npm run test:db
```

**No uses `npm run test:db` contra tu base de producción:** crea usuarios de prueba y modifica temporalmente la configuración.

### Prueba manual sugerida (con OpenAI real)

1. Sube un documento con un procedimiento, por ejemplo «Para calcular la norma de un vector: 1) … 2) … 3) …».
2. Pregunta «¿Cómo calculo la norma de un vector?». Debe seguir los pasos y citar la fuente; el contador baja en 1.
3. Pregunta «¿Qué película debería ver?». Debe rechazarla y el contador no cambia.
4. Pregunta algo del tema que no esté en el documento. Debe indicar que no tiene información y el contador no cambia.
5. Agota las preguntas, solicita más y apruébalas desde `/admin/requests` con una cantidad distinta.

---

## Limitaciones conocidas

- Los PDF escaneados (imágenes) no tienen texto extraíble. Conviértelos con OCR antes de subirlos.
- El procesamiento de documentos se ejecuta en una sola función (máx. 60 s, 10 MB y 800 fragmentos por archivo). Divide los documentos muy extensos.
- El conteo de tokens de entrada es una estimación conservadora (≈3 caracteres por token).
- La renovación mensual y los límites usan la zona horaria UTC.
