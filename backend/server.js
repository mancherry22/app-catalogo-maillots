// backend/server.js
const express = require('express');
const fs = require('fs'); // Para síncrono
const fsPromises = require('fs').promises; // Para asíncrono con promesas
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001; 

// --- CONFIGURACIÓN ---
const MAILLOTS_JSON_PATH = path.join(__dirname, 'datos', 'maillots.json'); 
const EDIT_PASSWORD = process.env.APP_EDIT_PASSWORD || "ritmicacenter"; 

// --- MIDDLEWARE ---
app.use(cors()); 
app.use(express.json()); 

// --- RUTAS DE LA API ---

// GET /api/maillots
app.get('/api/maillots', async (req, res) => {
  try {
    const data = await fsPromises.readFile(MAILLOTS_JSON_PATH, 'utf-8'); // Usar fsPromises
    const maillots = data.trim() === "" ? [] : JSON.parse(data); 
    res.json(maillots);
  } catch (error) {
    console.error('Error al leer/parsear maillots.json en GET /api/maillots:', error);
    if (error.code === 'ENOENT') { 
      console.log('Archivo maillots.json no encontrado. Devolviendo array vacío.');
      res.json([]); 
    } else if (error instanceof SyntaxError) { 
      console.log('Error de sintaxis en maillots.json. Devolviendo array vacío.');
      res.json([]);
    } else { 
      res.status(500).json({ message: 'Error interno del servidor al obtener maillots.' });
    }
  }
});

// POST /api/maillots/actualizar-etiquetas
app.post('/api/maillots/actualizar-etiquetas', async (req, res) => {
  const { modeloNo, etiquetas, password } = req.body;

  if (password !== EDIT_PASSWORD) {
    console.warn(`Intento de actualización fallido para "${modeloNo}": Contraseña incorrecta.`);
    return res.status(401).json({ message: 'Contraseña incorrecta.' });
  }

  if (!modeloNo || !Array.isArray(etiquetas)) {
    return res.status(400).json({ message: 'Datos inválidos: Se requiere "modeloNo" y un array de "etiquetas".' });
  }

  try {
    let maillotsData = [];
    try {
      const data = await fsPromises.readFile(MAILLOTS_JSON_PATH, 'utf-8'); // Usar fsPromises
      maillotsData = data.trim() === "" ? [] : JSON.parse(data);
    } catch (readError) {
      if (readError.code === 'ENOENT' || readError instanceof SyntaxError) {
        console.warn(`Archivo maillots.json no encontrado o corrupto durante la actualización. Se intentará continuar con un array vacío.`);
      } else {
        throw readError; 
      }
    }
    
    const maillotIndex = maillotsData.findIndex(m => String(m.nºModelo) === String(modeloNo));

    if (maillotIndex === -1) {
      return res.status(404).json({ message: `Maillot con nºModelo "${modeloNo}" no encontrado.` });
    }

    maillotsData[maillotIndex].etiquetas = etiquetas; 

    await fsPromises.writeFile(MAILLOTS_JSON_PATH, JSON.stringify(maillotsData, null, 2), 'utf-8'); // Usar fsPromises
    console.log(`INFO: Etiquetas actualizadas para nºModelo: "${modeloNo}".`);
    
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
app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
  const backendDataDir = path.dirname(MAILLOTS_JSON_PATH);

  // Usamos el 'fs' síncrono para existsSync
  if (!fs.existsSync(backendDataDir)) {
    // Usamos 'fsPromises' para mkdir
    fsPromises.mkdir(backendDataDir, { recursive: true })
      .then(() => console.log(`Directorio de datos del backend creado: ${backendDataDir}`))
      .catch(err => {
        if (err.code !== 'EEXIST') {
            console.error(`Error al crear directorio de datos del backend: ${err}`);
        } else {
            console.log(`Directorio de datos del backend (${backendDataDir}) ya existe o fue creado concurrentemente.`);
        }
      });
  } else {
    console.log(`Directorio de datos del backend (${backendDataDir}) ya existe.`);
  }
});