/* =========================================================
   MICA · Gestión de proyectos — CONFIGURACIÓN
   =========================================================
   1) Firebase: pegá acá la configuración de tu proyecto web
      (Firebase → Configuración del proyecto → Tus apps → SDK).
      Mientras quede vacía, la app funciona en MODO LOCAL:
      los datos se guardan solo en este navegador.
   2) Usuarios: si agregás o sacás un correo acá, hacé el mismo
      cambio en firestore.rules y volvé a publicar las reglas.
   ========================================================= */

export const FIREBASE = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/* Socios de MICA. El id no se cambia nunca: los datos lo usan. */
export const SOCIOS = [
  { id: "jeremias", nombre: "Jeremías" },
  { id: "jorge",    nombre: "Jorge" },
  { id: "julio",    nombre: "Julio" },
  { id: "jose",     nombre: "José" }
];

/* Cuentas de Google autorizadas (en minúsculas) y el socio de cada una. */
export const USUARIOS = [
  { email: "juliomonti91@gmail.com",   socio: "julio" },
  { email: "jplaza.mica@gmail.com",    socio: "jorge" },
  { email: "jgildeza.mica@gmail.com",  socio: "jeremias" },
  { email: "josemariamonti@gmail.com", socio: "jose" }
];

/* Titular de Magna Desarrollos SRL: dueño del bolsillo "Magna · Julio". */
export const TITULAR_MAGNA = "julio";
