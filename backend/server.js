// backend/server.js

// Módulos necesarios: Express para el servidor, fs (promesas) para archivos, path para rutas, cors para permisos.
const express = require('express');
const fs = require('fs').promises; // Usamos la versión de promesas de fs para async/await.
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001; // Puerto para el backend, configurable por variable de entorno.

// --- CONFIGURACIÓN ---
// Ruta al archivo JSON que actúa como nuestra base de datos.
const MAILLOTS_JSON_PATH = path.join(__dirname, 'datos', 'maillots.json'); // Asegúrate que 'datos' es el nombre correcto de tu carpeta.
//const EDIT_PASSWORD = "ritmicacenter"; // Contraseña para operaciones de escritura.
const EDIT_PASSWORD = process.env.APP_EDIT_PASSWORD || "ritmicacenter";

// --- MIDDLEWARE ---
app.use(cors()); // Habilita CORS para permitir peticiones desde el frontend (otro puerto/dominio).
app.use(express.json()); // Parsea automáticamente los cuerpos de las peticiones entrantes como JSON.

// --- RUTAS DE LA API ---

/**
 * GET /api/maillots
 * Devuelve la lista completa de maillots desde el archivo JSON.
 */
app.get('/api/maillots', async (req, res) => {
  try {
    const data = await fs.readFile(MAILLOTS_JSON_PATH, 'utf-8');
    // Si el archivo está vacío o solo contiene espacios, JSON.parse fallará.
    const maillots = data.trim() === "" ? [] : JSON.parse(data); 
    res.json(maillots);
  } catch (error) {
    // Manejo de errores específicos al leer o parsear el archivo.
    console.error('Error al leer/parsear maillots.json en GET /api/maillots:', error);
    if (error.code === 'ENOENT') { // ENOENT: Error No ENTry (archivo o directorio no existe)
      console.log('Archivo maillots.json no encontrado. Devolviendo array vacío.');
      res.json([]); 
    } else if (error instanceof SyntaxError) { // Error al parsear JSON.
      console.log('Error de sintaxis en maillots.json. Devolviendo array vacío.');
      res.json([]);
    } else { // Otros errores inesperados.
      res.status(500).json({ message: 'Error interno del servidor al obtener maillots.' });
    }
  }
});

/**
 * POST /api/maillots/actualizar-etiquetas
 * Actualiza las etiquetas de un maillot específico.
 * Requiere: modeloNo, etiquetas (array), password en el cuerpo de la petición.
 */
app.post('/api/maillots/actualizar-etiquetas', async (req, res) => {
  // Extraemos los datos del cuerpo de la petición.
  const { modeloNo, etiquetas, password } = req.body;

  // Verificación de la contraseña.
  if (password !== EDIT_PASSWORD) {
    console.warn(`Intento de actualización fallido para "${modeloNo}": Contraseña incorrecta.`);
    return res.status(401).json({ message: 'Contraseña incorrecta.' });
  }

  // Validación básica de los datos de entrada.
  if (!modeloNo || !Array.isArray(etiquetas)) {
    return res.status(400).json({ message: 'Datos inválidos: Se requiere "modeloNo" y un array de "etiquetas".' });
  }

  try {
    let maillotsData = [];
    // Intentamos leer los datos existentes.
    try {
      const data = await fs.readFile(MAILLOTS_JSON_PATH, 'utf-8');
      maillotsData = data.trim() === "" ? [] : JSON.parse(data);
    } catch (readError) {
      if (readError.code === 'ENOENT' || readError instanceof SyntaxError) {
        // Si el archivo no existe o está corrupto, podemos decidir si crear uno nuevo aquí
        // o simplemente fallar si se esperaba que existiera.
        // Por ahora, asumimos que si se está actualizando, el archivo debería existir
        // o al menos estar en un estado que permita empezar con [].
        console.warn(`Archivo maillots.json no encontrado o corrupto durante la actualización. Se intentará continuar con un array vacío si es el primer maillot.`);
      } else {
        throw readError; // Relanzar otros errores de lectura.
      }
    }
    
    // Buscamos el maillot a actualizar. Es importante comparar como strings si nºModelo puede ser numérico.
    const maillotIndex = maillotsData.findIndex(m => String(m.nºModelo) === String(modeloNo));

    if (maillotIndex === -1) {
      return res.status(404).json({ message: `Maillot con nºModelo "${modeloNo}" no encontrado.` });
    }

    // Actualizamos las etiquetas del maillot encontrado.
    maillotsData[maillotIndex].etiquetas = etiquetas; 

    // NOTA: Si la ordenación es importante después de cada actualización de etiquetas
    // (aunque normalmente las etiquetas no afectan el orden por nºModelo),
    // se debería importar y usar aquí la función `ordenacionNaturalMaillots`.
    // Ejemplo:
    // const { ordenacionNaturalMaillots } = require('./ruta/a/tu/funcionDeOrdenacion'); // Si estuviera en otro archivo
    // maillotsData.sort(ordenacionNaturalMaillots);

    // Escribimos el array completo de maillots de nuevo al archivo JSON.
    await fs.writeFile(MAILLOTS_JSON_PATH, JSON.stringify(maillotsData, null, 2), 'utf-8');
    console.log(`INFO: Etiquetas actualizadas para nºModelo: "${modeloNo}".`);
    
    // Devolvemos un mensaje de éxito y el maillot actualizado.
    res.json({ 
      message: 'Etiquetas actualizadas correctamente.', 
      maillotActualizado: maillotsData[maillotIndex] 
    });

  } catch (error) {
    console.error(`Error al actualizar etiquetas para nºModelo "${modeloNo}":`, error);
    res.status(500).json({ message: 'Error interno del servidor al actualizar etiquetas.' });
  }
});


// --- INICIAR SERVIDOR ---
// El servidor se pone a escuchar en el puerto especificado.
app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
  // Verificamos al inicio si el directorio de datos del backend existe.
  // Esto no crea maillots.json, solo el directorio si falta.
  const backendDataDir = path.dirname(MAILLOTS_JSON_PATH);
  if (!fs.existsSync(backendDataDir)) {
    fs.mkdir(backendDataDir, { recursive: true })
      .then(() => console.log(`Directorio de datos del backend creado: ${backendDataDir}`))
      .catch(err => console.error(`Error al crear directorio de datos del backend: ${err}`));
  }
});