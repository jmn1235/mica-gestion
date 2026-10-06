# MICA · Gestión de proyectos

App web para manejar las finanzas de cada proyecto de MICA (Minería Integral Catamarca), separando la plata de cada obra de la plata propia de Magna Desarrollos SRL. Funciona en computadora y en celular, se instala como app y la usan los cuatro socios con su cuenta de Google.

Esta carpeta es la app completa, con las seis etapas del plan. Se publica una sola vez siguiendo la **Puesta en marcha**.

---

## Qué hace

**Base (etapa 1)**
- Login con Google para los cuatro socios. El control lo hace la app y también la base de datos.
- Bolsillos dentro de la cuenta de Magna: Magna · Julio, Magna · Reserva fiscal, MICA · Estructura y uno por proyecto. La suma de los bolsillos es el saldo del banco.
- Carga de gastos, ingresos y pases entre bolsillos en pesos, congelados al dólar MEP de la fecha.
- Tablero por proyecto, vista MICA y vista Magna. Movimientos con filtros, papelera, exportación a Excel y respaldo.

**Contrato y presupuesto (etapa 2)**
- Ítems por rubro con precio de venta y costo directo cotizado (materiales, mano de obra, equipos, subcontratos), gastos generales y margen.
- **Importación de la planilla de cotización desde Excel**, dentro de la app.
- Ventana de ejecución por ítem, avance físico mensual, línea base, curva S, proyección de cierre y desvío por ítem.

**Certificados y cobranza (etapa 3)**
- Certificado mensual con cantidades propuestas desde el avance, amortización del anticipo y fondo de reparo.
- Factura, vencimiento, cobros con retenciones y tipo de cambio de pago, estados y facturas vencidas.
- Diferencia de cambio entre el dólar de la factura y el MEP del cobro.

**Socios (etapa 4)**
- Cuenta de cada socio por proyecto y en MICA: aportes, préstamos con interés, honorarios, parte del resultado y lo distribuido.
- Préstamos con tasa anual en dólares, devengada día a día. Acuerdos de honorarios por socio.
- Reparto de la estructura de MICA y de los gastos de Magna entre proyectos.

**Impuestos e IA (etapa 5)**
- **Impuestos** (menú lateral; en el celular, en «Más»):
  - En un proyecto: IVA mes a mes, Ingresos Brutos, impuesto al cheque, Ganancias estimada, retenciones sufridas y cuánto falta reservar. Un botón arma el pase a la reserva.
  - En MICA y en Magna: IVA de toda la cuenta, lo reservado y lo pagado por impuesto.
  - El tablero muestra el resultado antes y después de impuestos, y Socios reparte el resultado neto.
- **Comprobante de cada gasto**: Factura A (IVA recuperable), B o C, **Sueldo o tasa** (deducible, sin IVA) y Sin factura (no deducible).
- **Asistente con IA**:
  - **Cargar con IA**, arriba del formulario de carga: leer una foto o PDF de una factura (propone un gasto por renglón, con el IVA prorrateado), o escribir o dictar el gasto en palabras.
  - **Cierre de mes** (menú Proyecto): lista de control del mes y un informe escrito para los socios.
  - **Preguntar**: preguntas en lenguaje natural sobre los datos cargados.

**Cierre de proyecto y base de costos (etapa 6)**
- **Cierre de proyecto** (menú Proyecto; en el celular, en «Más»):
  - Lista de control antes de cerrar: avance completo, todo facturado y cobrado, anticipo amortizado, fondo de reparo devuelto, gastos completos y caja suficiente.
  - Resultado final: neto de impuestos, menos la parte de estructura y de Magna, más la diferencia de cambio de la liquidación.
  - **Liquidación en el orden acordado**: 1) reservar los impuestos, 2) devolver los préstamos con su interés, 3) devolver los aportes, 4) pagar los honorarios, 5) cubrir la parte de estructura y de Magna, 6) repartir el resto según la participación, o dejarlo en MICA · Estructura o reinvertirlo en otro proyecto como aporte de cada socio.
  - Cada paso propone los movimientos con sus montos en pesos al dólar de la liquidación. Se revisan, se corrigen si el banco debitó otro importe y se registran juntos.
  - Al cerrar se fijan la fecha (intereses y honorarios dejan de correr), la parte de estructura y la diferencia de cambio. Se puede reabrir.
  - Informe de cierre con IA, con lecciones para la próxima cotización, e impresión o PDF.
- **Base de costos** (grupo MICA y Magna):
  - Una ficha por ítem de cada obra cerrada: costo real por unidad ejecutada en materiales, mano de obra, equipos, subcontratos e indirectos, gastos generales de la obra, costo cotizado, desvío y margen.
  - Búsqueda y filtros por rubro, unidad, tipo de obra y obra, con promedio, mínimo y máximo por unidad.
  - Carga manual y **importación desde Excel** de costos de obras anteriores (por ejemplo, Río Colorado).
  - **Exportación a Excel en el formato de la planilla de cotización**: se puede importar directo en el presupuesto de una obra nueva.
  - Al editar un ítem del presupuesto, la app muestra los costos reales de ítems parecidos que hay en la base.

---

## Puesta en marcha (una sola vez, unos 30 minutos)

Hace falta una computadora (no el celular) y dos cuentas: una de Google para Firebase y una de GitHub. Conviene que las dos sean de MICA o de Julio, y que quien las cree sea quien vaya a administrar la app.

Orden: primero Firebase (base de datos y login), después GitHub (donde queda publicada la app), y por último conectar las dos.

### Paso 1. Crear el proyecto en Firebase

1. Entrá a <https://console.firebase.google.com> y tocá **Crear un proyecto**. Nombre sugerido: `mica-gestion`. Google Analytics no hace falta; se puede desactivar.
2. En la página del proyecto, tocá el ícono **`</>`** (agregar app web). Apodo: `MICA web`. **No** marques Firebase Hosting. Tocá **Registrar app**.
3. Firebase muestra un bloque como este. **Dejá esa pestaña abierta**: los valores se usan en el paso 5.

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "mica-gestion.firebaseapp.com",
     projectId: "mica-gestion",
     storageBucket: "mica-gestion.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```

   Si se cierra, se vuelve a ver en el engranaje ⚙️ → **Configuración del proyecto** → **Tus apps**.

> La configuración web de Firebase no es secreta: identifica el proyecto, no da acceso. Lo que protege los datos son las reglas del paso 3.

### Paso 2. Activar el login con Google

1. Menú de la izquierda: **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso → Google → Habilitar**. Elegí el correo de asistencia y guardá.

El dominio de GitHub se agrega en el paso 6, cuando ya esté publicada la app.

### Paso 3. Crear la base de datos y publicar las reglas

1. Menú: **Compilación → Firestore Database → Crear base de datos**.
2. Si pregunta la edición, elegí **Standard**.
3. Ubicación: **southamerica-east1 (São Paulo)**, la más cercana. No se puede cambiar después.
4. Modo: **producción**. Tocá **Crear**.
5. Cuando termine, pestaña **Reglas**: borrá todo lo que hay, pegá el contenido completo del archivo **`firestore.rules`** de esta carpeta (se abre con el Bloc de notas o TextEdit) y tocá **Publicar**.

Las reglas dejan leer y escribir solo a los cuatro correos autorizados. El plan gratuito (Spark) alcanza de sobra para cuatro usuarios.

### Paso 4. Subir la app a GitHub

1. Descomprimí el zip en la computadora. Queda una carpeta con `index.html`, `LEEME.md`, `sw.js` y las carpetas `css`, `img` y `js`.
2. Entrá a <https://github.com> (creá una cuenta si no hay) y tocá **New** (o el **+** de arriba a la derecha → **New repository**).
   - Nombre: `mica-gestion`.
   - Visibilidad: **Public** (ver la nota de abajo).
   - No marques README, .gitignore ni licencia.
   - Tocá **Create repository**.
3. En la página del repositorio vacío, tocá el enlace **uploading an existing file**.
4. Abrí la carpeta descomprimida, **seleccioná todo lo que hay adentro** (no la carpeta en sí: su contenido) y arrastralo a la página de GitHub. Usá Chrome o Edge, que suben las subcarpetas.
5. Esperá a que termine la lista (son 45 o 46 archivos) y tocá **Commit changes**.
6. Revisá que en la portada del repositorio se vean `index.html` y las carpetas `css`, `img` y `js` en la raíz. Si quedó todo dentro de otra carpeta, la app no va a abrir: borrá el repositorio (Settings → al final, Delete) y repetí este paso arrastrando el contenido.

> El archivo `.nojekyll` es oculto y puede no subirse; no hace falta.

> GitHub Pages gratis publica repositorios **públicos**: el código queda visible, pero los datos no, porque viven en Firestore y solo los leen las cuatro cuentas autorizadas. La clave de IA tampoco está en el código. Si se prefiere el repositorio privado, hace falta un plan pago de GitHub.

### Paso 5. Pegar la configuración de Firebase

1. En GitHub, entrá a la carpeta **`js`** y abrí **`config.js`**.
2. Tocá el lápiz ✏️ (Edit this file).
3. Reemplazá las seis líneas vacías de `FIREBASE` por las de Firebase (paso 1), respetando comillas y comas. Tiene que quedar así:

   ```js
   export const FIREBASE = {
     apiKey: "AIza...",
     authDomain: "mica-gestion.firebaseapp.com",
     projectId: "mica-gestion",
     storageBucket: "mica-gestion.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```

4. Revisá en el mismo archivo la lista `USUARIOS`: los cuatro correos de Google de los socios, en minúsculas. Si alguno cambia, cambialo también en `firestore.rules` y volvé a publicar las reglas (paso 3.5).
5. Tocá **Commit changes** (dos veces, la segunda en la ventana que aparece).

### Paso 6. Publicar con GitHub Pages y autorizar el dominio

1. En el repositorio: **Settings → Pages**.
2. En **Build and deployment**: Source **Deploy from a branch**, Branch **main**, carpeta **/ (root)**. Tocá **Save**.
3. En uno o dos minutos aparece arriba la dirección: `https://TU-USUARIO.github.io/mica-gestion/`. Esa es la dirección de la app para los cuatro socios.
4. Volvé a Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio** y poné `TU-USUARIO.github.io` (sin `https://` y sin `/mica-gestion`).

### Paso 7. Primer ingreso

1. **Julio entra primero** con su cuenta de Google. La app crea la cuenta de Magna, los bolsillos, el proyecto Tres Cruces y las categorías. La pantalla de entrada tiene que mostrar el botón de Google y, ya adentro, junto al nombre tiene que decir «En la nube». Si en cambio pide elegir el socio o dice «Modo local», la configuración del paso 5 no quedó bien.
2. **Ajustes → Impuestos e IA**:
   - Cargar las alícuotas: **Ingresos Brutos** (viene en 0 y hay que completarla), Ganancias, impuesto al cheque y su parte computable. **Validarlas con la contadora.**
   - Cargar la **clave de IA** (ver más abajo) y tocar **Probar la clave**.
3. **Ajustes → Proyectos → Tres Cruces**: revisar fecha de inicio, plazo de pago, amortización del anticipo (en 3 certificados iguales, según la oferta), IVA, retenciones habituales del cliente y participación de cada socio.
4. **Contrato y presupuesto → Importar desde Excel**: subir la planilla de cotización de Tres Cruces, revisar qué columna es cada dato y confirmar. Después completar el costo cotizado, los gastos generales y la ventana de cada ítem, y **congelar la línea base**.
5. **Cargar → Ingreso → Saldo inicial**: lo que tenía la cuenta de Magna el día que se empieza a usar la app, en el bolsillo que corresponda (normalmente Magna · Julio).
6. Si la plata de Magna pagó gastos de Tres Cruces antes de que el proyecto cobrara, registrarlo como **Pase → Préstamo** de Magna · Julio al proyecto, con su tasa.
7. Mandarles la dirección a Jeremías, Jorge y José para que entren con su cuenta de Google.

### Paso 8. Instalar en el celular

- **Android (Chrome)**: abrir la dirección, menú ⋮ → **Instalar app** o **Agregar a la pantalla principal**.
- **iPhone (Safari)**: abrir la dirección, botón Compartir → **Agregar a inicio**.

### Si algo no anda

| Lo que se ve | Qué hacer |
|---|---|
| Página 404 de GitHub | Esperar unos minutos después del paso 6. Si sigue, revisar que `index.html` esté en la raíz del repositorio. |
| Pide elegir el socio en vez de entrar con Google, o dice «Modo local» | `js/config.js` quedó vacío o con un error de comillas o comas. Revisarlo contra el ejemplo del paso 5. |
| Error `auth/unauthorized-domain` al entrar | Falta el dominio `TU-USUARIO.github.io` en Firebase (paso 6.4). |
| «La cuenta … no está autorizada» | El correo no está en `USUARIOS` de `js/config.js`, o tiene mayúsculas o un error de tipeo. |
| Aviso rojo de que no se pueden leer o guardar datos | Las reglas no están publicadas o les falta un correo (paso 3.5). |
| La IA dice que la cuenta no tiene saldo | Cargar crédito en console.anthropic.com → Billing. |
| No se ve un cambio recién subido | Recargar la página. La app siempre busca primero la versión nueva. |

---

## Asistente con IA

La IA usa la API de Anthropic (Claude) con una clave de MICA. Es opcional: sin clave, todo lo demás funciona igual.

1. Entrá a <https://console.anthropic.com> con la cuenta de MICA.
2. **Billing**: cargá crédito. El uso normal de cuatro socios debería ser de pocos dólares por mes. Ajustes muestra el costo estimado del mes en cada dispositivo.
3. **API Keys → Create Key**. Copiala (empieza con `sk-ant-`).
4. En la app: **Ajustes → Impuestos e IA → Clave de API de Anthropic**, pegarla, **Guardar** y **Probar la clave**.

La clave se guarda **solo en ese dispositivo**, nunca en la base compartida ni en GitHub. Cada socio que quiera usar la IA la carga en su celular o computadora. Si se pierde un celular, se borra la clave en console.anthropic.com y se crea otra.

Modelo: por defecto **Sonnet 5.5**, equilibrado entre precisión y costo para leer facturas. Se puede elegir **Haiku 4.5** (rápido y barato) u **Opus 5.5** (más preciso, más caro).

La IA **propone** y un socio **confirma**: nada se guarda sin revisar el formulario o la vista previa. Los datos que lee para responder salen del navegador directo a Anthropic.

---

## Uso diario

- **Cargar un gasto**: elegí arriba el proyecto y tocá **Cargar**. Con **Cargar con IA** se saca una foto a la factura o se dicta el gasto. A mano: fecha, monto en pesos (la cotización MEP se busca sola), ítem, tipo de costo y comprobante. Con Factura A el IVA se calcula solo y no cuenta como costo. Sueldos, cargas sociales y tasas van como **Sueldo o tasa**.
- **Gastos de Magna** (contadora de la SRL, CASEMICA): elegí **Magna Desarrollos** arriba y cargalos con el tilde **Gasto recuperable**. Quedan a favor de Julio hasta que se registre el **Pase → Reintegro**.
- **Gastos comunes de MICA**: elegí **MICA · vista general** arriba; el gasto va al bolsillo MICA · Estructura con su categoría.
- **Pases entre bolsillos**: no son ingreso ni gasto. Siempre se elige qué tipo de pase es (préstamo, devolución, aporte, reserva de impuestos, reintegro, honorarios o distribución).
- **Cada mes**, en este orden:
  1. Contrato y presupuesto → **Avance físico**: la cantidad ejecutada de cada ítem.
  2. **Certificados**: crear el certificado del mes, cargar la factura cuando se emita y el cobro cuando se acredite.
  3. **Impuestos**: tocar **Reservar** para pasar a la reserva fiscal lo que falta.
  4. **Cierre de mes**: revisar la lista de control y generar el informe para los socios.
- **Pago de impuestos**: egreso desde el bolsillo **Magna · Reserva fiscal**, con la categoría del impuesto.
- **Al terminar una obra**, en **Cierre de proyecto**:
  1. Resolver lo que marque la lista de control (avance, cobros, fondo de reparo, gastos completos).
  2. Elegir la fecha y el dólar de la liquidación, y qué se hace con el resultado.
  3. Hacer las transferencias en el banco y registrar cada paso (o «Registrar todo»).
  4. Tocar **Cerrar el proyecto**. Sus costos pasan a la base de costos.
  5. Si después aparece un gasto o un cobro, reabrir, cargarlo y volver a cerrar.
- **Al cotizar una obra nueva**: buscar en **Base de costos** los ítems parecidos, exportarlos a Excel y usarlos de punto de partida para el costo directo.
- **Respaldo**: una vez por mes, **Ajustes → Datos y respaldo → Descargar respaldo**, y guardarlo en el Drive de MICA.

## Actualizar la app más adelante

1. En el repositorio: **Add file → Upload files** y arrastrar el contenido de la carpeta nueva. GitHub reemplaza los archivos con el mismo nombre.
2. **No subir `js/config.js`** de la carpeta nueva: viene vacío y la app pasaría a modo local. Si se sube por error, volver a pegar la configuración (paso 5).
3. Si una actualización agrega colecciones, hay que volver a publicar `firestore.rules` (paso 3.5). Se avisa en cada entrega.
4. Los datos cargados no se tocan.

## Permisos y aprobaciones

- **Administrador:** el titular de Magna (`TITULAR_MAGNA` en `js/config.js`, hoy Julio). Carga, modifica y configura todo.
- **Operativo:** ve y exporta todo; propone gastos de obra (altas, cambios y bajas) y avance físico. Lo propuesto queda en la colección `solicitudes` y no se aplica hasta que el administrador lo aprueba en **Aprobaciones**.
- **Veedor:** ve y exporta todo, no modifica.
- Los permisos se cambian en **Ajustes → Usuarios y permisos** y se guardan en `config/permisos`. Las reglas de Firestore los aplican en la base: aunque alguien manipule la pantalla, un operativo solo puede crear pedidos a su nombre y un veedor no puede escribir nada.

## Probar sin Firebase

Mientras `js/config.js` tenga la configuración vacía, la app funciona en **modo local**: se elige el socio en pantalla y los datos quedan solo en ese navegador. En **Ajustes → Datos y respaldo** se pueden cargar datos de ejemplo para recorrerla. Para abrirla en la computadora hace falta un servidor (los módulos de JavaScript no corren abriendo el archivo con doble clic), por ejemplo desde la carpeta: `python3 -m http.server 8000` y luego <http://localhost:8000>.

## Agregar o cambiar un socio

1. En `js/config.js`, editar `SOCIOS` (el `id` no se cambia nunca) y `USUARIOS` (correo en minúsculas y socio).
2. En `firestore.rules`, actualizar la lista `socios()` (correo en minúsculas y id del socio) y volver a **Publicar** las reglas en Firebase.
4. El permiso de la persona nueva (operativo o veedor) se elige en **Ajustes → Usuarios y permisos**. Por defecto entra como operativo.
3. Guardar `js/config.js` en GitHub.

## Cómo está armada la carpeta

```
index.html              página principal
manifest.webmanifest    datos para instalarla como app
sw.js                   permite abrirla sin señal (siempre busca primero la versión nueva)
firestore.rules         reglas de seguridad de la base de datos
css/mica.css            estilos con la marca MICA
img/                    logo e íconos
js/config.js            ⚙️ configuración de Firebase y usuarios autorizados
js/app.js               arranque, login y navegación
js/db.js                lectura y escritura de datos
js/modelo.js            cálculos: bolsillos, saldos, resultados, socios e impuestos
js/presupuesto.js       presupuesto, avance, línea base, proyección e importación de Excel
js/certificados.js      certificados, facturas, cobros, vencimientos y diferencia de cambio
js/impuestos.js         IVA y reserva fiscal
js/cierreProyecto.js    liquidación del cierre y fichas de la base de costos
js/ia.js                conexión con la IA (la clave queda en el dispositivo)
js/contextoIA.js        resumen de datos que lee la IA
js/mep.js               cotización del dólar MEP
js/semilla.js           datos iniciales (Tres Cruces y categorías) y datos de ejemplo
js/vistas/              una pantalla por archivo
```

---

## Criterios de cálculo

**Moneda y resultado**
- Todo se carga en pesos y se congela al dólar MEP (bolsa, venta) de la fecha del movimiento. Fuente: api.argentinadatos.com y, como respaldo, dolarapi.com.
- La suma de los bolsillos es el saldo que tiene que mostrar el banco.
- Lo cobrado cuenta como venta neta de IVA, sumando las retenciones: no entran al banco, pero son parte de lo facturado. El saldo del bolsillo cuenta solo lo acreditado.
- Resultado del proyecto = cobrado − costos − honorarios − intereses + intereses ganados, en dólares, netos de IVA. El IVA no es resultado.
- Resultado después de impuestos = resultado − Ingresos Brutos − impuesto al cheque − Ganancias a cargo.

**Presupuesto y seguimiento**
- El presupuesto está en la moneda del contrato. Para contratos en dólares, lo real se compara en dólares MEP; para contratos en pesos, en pesos nominales.
- Avance físico global = suma de (cantidad ejecutada × precio unitario) ÷ venta total. El plan reparte la cantidad de cada ítem en partes iguales entre los meses de su ventana.
- Avance de gasto = costo real ÷ costo cotizado (directo más gastos generales).
- Proyección de cierre (igual que en Río Colorado): con al menos 5% de avance y costo cargado, costo final = costo real ÷ avance físico; si no, se toma lo cotizado. Los gastos generales se proyectan con el avance global.
- En Seguimiento, la diferencia es cotizado menos proyectado: en negro lo que queda a favor, en rojo el sobrecosto.

**Certificados y cobranza**
- Certificado: bruto = cantidades × precio unitario + ajustes; neto = bruto − amortización del anticipo − fondo de reparo; total = neto + IVA.
- Un cobro cancela de la factura (acreditado + retenciones) ÷ tipo de cambio de pago (en contratos en pesos, acreditado + retenciones). La factura queda cobrada cuando el saldo es menor al 0,5%.
- Diferencia de cambio = (cobro al dólar MEP − cobro al tipo de cambio de pago), sobre la parte neta de IVA.

**Socios**
- Interés de un préstamo = capital en dólares × ((1 + tasa anual)^(días/365) − 1), compuesto día a día. Las devoluciones pagan primero el interés y después el capital, empezando por el préstamo más viejo. Se devenga hasta hoy, o hasta la fecha de cierre si el proyecto está cerrado.
- Honorarios: se computan los meses cerrados (hasta el mes anterior al actual). Los de porcentaje usan la base del mes en dólares MEP netos de IVA.
- La estructura de MICA y los gastos recuperables de Magna se reparten entre proyectos en proporción a lo cobrado por cada uno, netos del efecto en Ganancias.
- Neto para repartir = resultado después de impuestos − parte de estructura y gastos de Magna.
- A favor de cada socio = aportes + préstamos con interés + honorarios pendientes + su parte del neto − lo distribuido (a Julio se le suman los reintegros pendientes).

**Impuestos** (estimaciones de gestión para reservar a tiempo; la liquidación la hace la contadora)
- IVA débito: el IVA de cada factura emitida, al tipo de cambio de la factura, en el mes de la factura; más el de los cobros cargados a mano sin certificado.
- IVA crédito: gastos con Factura A del proyecto (y, en la vista Magna, también los de Estructura y Magna).
- Saldo de IVA = débito − crédito − retenciones de IVA sufridas.
- Ingresos Brutos = alícuota × lo cobrado neto de IVA. Las retenciones de IIBB sufridas son pago a cuenta.
- Impuesto al cheque = alícuota de crédito o débito × cada ingreso o egreso de cuentas bancarias (los pases internos no pagan). La parte computable (33% por defecto) se toma a cuenta de Ganancias.
- Ganancias = alícuota × (cobrado − costos deducibles − Ingresos Brutos − cheque no computable). Son deducibles los gastos con Factura A, B o C y los de sueldo o tasa; los gastos sin factura no. Los honorarios y los intereses entre socios no se deducen (criterio prudente).
- Ganancias a cargo = Ganancias − cheque computable. Las retenciones de Ganancias sufridas son pago a cuenta: bajan lo que falta pagar, no el costo.
- A reservar = saldo de IVA + Ingresos Brutos a pagar + cheque + Ganancias a pagar (al último dólar MEP cargado) − lo ya pasado a Magna · Reserva fiscal.

**Cierre de proyecto**
- La liquidación se calcula al dólar MEP de la fecha elegida: lo que está en dólares (préstamos, aportes, honorarios, resultado) se pasa a pesos a ese dólar.
- La reserva del paso 1 anticipa el impuesto al cheque y el efecto en Ganancias de los propios pagos del cierre.
- A Julio se le dejan sus pagos en Magna · Julio (pase); a los demás socios se les transfiere (egreso de la cuenta).
- Parte de estructura del paso 5 = lo asignado al proyecto × (1 − alícuota de Ganancias), igual que en la cuenta de los socios.
- Diferencia de cambio = lo que queda en caja para el resultado (más el IVA ya reservado de facturas por cobrar) − el resultado pendiente según las cuentas. Es lo que se ganó o perdió por tener pesos y pagar en pesos más tarde. Se fija al cerrar y se reparte según la participación.
- Si hay facturas por cobrar al cerrar, se reparte lo que hay en caja y el resto queda a favor de cada socio hasta el cobro.
- Al cerrar, la parte de estructura del proyecto queda fija; lo que se gaste después en Estructura se reparte entre los proyectos abiertos.
- Resultado reinvertido: cuenta como distribuido en el proyecto que cierra y como aporte del socio en el destino. Lo que queda en Estructura se suma a la cuenta de cada socio en la vista MICA.

**Base de costos**
- Costo real del ítem = lo imputado al ítem + su parte de lo imputado a su rubro (según el peso de cada ítem del rubro en el costo directo cotizado; si no tiene costo cotizado, según la venta).
- Gastos generales del ítem = su parte de lo imputado a «General de obra», con el mismo criterio sobre todos los ítems.
- Costo por unidad = costo ÷ cantidad ejecutada (si no hay avance cargado, la cantidad cotizada).
- Desvío = costo real del ítem ÷ costo directo cotizado − 1. Margen = 1 − costo total ÷ precio de venta.
- Contratos en pesos: lo cotizado se pasa a dólares al promedio de los dólares de los gastos del proyecto.

## Guía de uso

La guía para los socios está en `ayuda.html` (también se abre desde el menú: **Guía de uso**). Se publica junto con el resto de los archivos.

## Íconos

La marca MICA se usa como ícono de la pestaña del navegador (`img/favicon.ico`) y como ícono de la app en el celular (`img/icon-192.png`, `img/icon-512.png`, `img/icon-maskable-512.png`, `img/apple-touch-icon.png`). Si la app ya estaba instalada en el celular, hay que desinstalarla y volver a instalarla para que tome el ícono nuevo.

## Novedades de la versión 8

- **Carga de gastos:** «Asignar costo a» en lugar de «Se paga desde», y «Monto total en pesos» (el total de la factura, con IVA y percepciones). Debajo se ve el desglose: neto, IVA, percepciones y total.
- **IVA «Varias»:** para facturas con renglones de distintas alícuotas; se carga el IVA total a mano.
- **Percepciones** de IIBB, IVA y Ganancias en las compras (carga manual y lectura de facturas con IA). No son costo: bajan lo que queda por pagar de cada impuesto.
- **Categoría y subcategoría** en cada gasto de obra, además de la imputación. Las categorías son fijas (alimentan la base de costos); las subcategorías se editan en Ajustes → Cuentas y categorías. Mano de obra trae Quincenas, Sueldo mensual, Honorarios (sin relación de dependencia), Aporte gremial y Formulario 931.
- **Gasto pagado por un socio:** al marcarlo, la app crea un préstamo vinculado del socio al proyecto (id del gasto + `__prest`), con la tasa de Ajustes → Impuestos e IA. Se edita y se borra junto con el gasto. Para los operativos, el préstamo nace al aprobar el pedido.
- **Planilla para la contadora** (Exportar y datos): en pesos, por mes o rango, con compras con factura, ventas, retenciones, sueldos y cargas, gastos sin factura aparte y un resumen mensual con fórmulas.
- **Excel con formato** en todas las exportaciones (ExcelJS desde cdnjs): encabezados con los colores de MICA, filtros, fila de títulos fija, montos y fechas con formato, totales con SUBTOTAL y hoja «Léeme».
- Las reglas de Firestore no cambian respecto de la versión 7.

