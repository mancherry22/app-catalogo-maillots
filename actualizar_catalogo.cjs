const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN ---
// Directorios y constantes utilizados por el script.
const SOURCE_IMAGES_DIR = path.join(__dirname, 'fuente_imagenes');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PUBLIC_IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const BACKEND_DATA_DIR = path.join(__dirname, 'backend', 'datos'); // Directorio de datos del backend.
const MAILLOTS_JSON_PATH = path.join(BACKEND_DATA_DIR, 'maillots.json'); // Archivo JSON maestro.
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// --- FUNCIÓN DE ORDENACIÓN ---
// Realiza una ordenación natural para los nºModelo (ej: "2A" antes de "10A").
function ordenacionNaturalMaillots(a, b) {
  const maillotA_No = String(a.nºModelo).toUpperCase();
  const maillotB_No = String(b.nºModelo).toUpperCase();
  const re = /([A-Z]*)(\d+)([A-Z]*)|([A-Z]+)|(\d+)/g; // Separa texto y números.
  const partsA = [];
  const partsB = [];

  maillotA_No.replace(re, (m, prefix, num, suffix, textOnly, numOnly) => {
    if (num) {
      partsA.push(prefix || '');
      partsA.push(parseInt(num, 10));
      partsA.push(suffix || '');
    } else if (textOnly) {
      partsA.push(textOnly);
    } else if (numOnly) {
      partsA.push(parseInt(numOnly, 10));
    }
  });

  maillotB_No.replace(re, (m, prefix, num, suffix, textOnly, numOnly) => {
    if (num) {
      partsB.push(prefix || '');
      partsB.push(parseInt(num, 10));
      partsB.push(suffix || '');
    } else if (textOnly) {
      partsB.push(textOnly);
    } else if (numOnly) {
      partsB.push(parseInt(numOnly, 10));
    }
  });

  for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
    if (partsA[i] !== partsB[i]) {
      if (typeof partsA[i] === 'number' && typeof partsB[i] === 'number') {
        return partsA[i] - partsB[i];
      }
      return String(partsA[i]).localeCompare(String(partsB[i]));
    }
  }
  return partsA.length - partsB.length;
}

// --- FUNCIONES AUXILIARES ---

// Asegura que los directorios necesarios para el script existan.
function ensureDirectoriesExist() {
  const dirsToEnsure = [PUBLIC_IMAGES_DIR, BACKEND_DATA_DIR, SOURCE_IMAGES_DIR];
  // No es estrictamente necesario crear PUBLIC_DIR por separado si los otros ya lo hacen con recursive:true,
  // pero lo mantengo por si se usa PUBLIC_DIR para otras cosas.
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    console.log(`Directorio creado: ${PUBLIC_DIR}`);
  }
  dirsToEnsure.forEach(dirPath => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Directorio creado: ${dirPath}`);
      if (dirPath === SOURCE_IMAGES_DIR) {
        console.log(`Por favor, añade imágenes en "${SOURCE_IMAGES_DIR}" para procesar.`);
      }
    }
  });
}

// Carga los maillots existentes desde el archivo JSON.
// Devuelve un array vacío si el archivo no existe o hay un error de parsing.
function loadExistingMaillots() {
  if (fs.existsSync(MAILLOTS_JSON_PATH)) {
    try {
      const jsonData = fs.readFileSync(MAILLOTS_JSON_PATH, 'utf-8');
      if (jsonData.trim() === "") return []; // Manejo de archivo JSON vacío.
      return JSON.parse(jsonData);
    } catch (error) {
      console.error(`Error al leer o parsear ${MAILLOTS_JSON_PATH}. Se devolverá un array vacío.`, error);
      return [];
    }
  }
  return [];
}

/**
 * Extrae el nº de Modelo del nombre del archivo.
 * ASUNCIÓN: El nombre del archivo (sin extensión) es el nº de Modelo.
 * Ej: "1A.jpg" -> "1A"
 */
function extractNoModeloFromFilename(filename) {
  return path.parse(filename).name;
}

// --- LÓGICA PRINCIPAL DEL SCRIPT ---
function actualizarCatalogo() {
  console.log('Iniciando actualización del catálogo...');
  ensureDirectoriesExist();

  const existingMaillots = loadExistingMaillots();
  // Uso un Map para una gestión eficiente (búsqueda y actualización) de los maillots por nºModelo.
  const maillotsMap = new Map(existingMaillots.map(m => [m.nºModelo, m]));

  let archivosFuente;
  try {
    archivosFuente = fs.readdirSync(SOURCE_IMAGES_DIR);
  } catch (error) {
    console.error(`Error crítico al leer el directorio ${SOURCE_IMAGES_DIR}:`, error.message);
    console.log(`Asegúrate de que la carpeta "${path.basename(SOURCE_IMAGES_DIR)}" exista en la raíz del proyecto.`);
    return;
  }
  
  if (archivosFuente.length === 0) {
    console.log(`No se encontraron imágenes en "${SOURCE_IMAGES_DIR}".`);
    // Aún así, guardo el JSON para asegurar que esté ordenado o para crearlo si no existía.
    const sortedMaillots = Array.from(maillotsMap.values()).sort(ordenacionNaturalMaillots);
    fs.writeFileSync(MAILLOTS_JSON_PATH, JSON.stringify(sortedMaillots, null, 2), 'utf-8');
    console.log(`Archivo ${path.basename(MAILLOTS_JSON_PATH)} guardado (posiblemente vacío o solo reordenado).`);
    return;
  }

  let cambiosRealizados = false; // Flag para un log final más informativo.

  // Proceso cada archivo en el directorio fuente de imágenes.
  archivosFuente.forEach(filename => {
    const sourceFilePath = path.join(SOURCE_IMAGES_DIR, filename);
    
    let stat;
    try {
      stat = fs.statSync(sourceFilePath);
    } catch(error) {
      console.warn(`AVISO: No se pudo acceder a "${filename}". Omitiendo. ${error.message}`);
      return; 
    }

    // Solo proceso archivos que tengan una extensión de imagen válida.
    if (stat.isFile() && VALID_IMAGE_EXTENSIONS.includes(path.extname(filename).toLowerCase())) {
      const noModelo = extractNoModeloFromFilename(filename);
      if (!noModelo) {
        console.warn(`AVISO: No se pudo extraer nºModelo para "${filename}". Omitiendo.`);
        return;
      }

      const targetImageFilePath = path.join(PUBLIC_IMAGES_DIR, filename);
      const imagenLocalUrl = `/images/${filename}`; // Ruta URL para el JSON.

      try {
        fs.copyFileSync(sourceFilePath, targetImageFilePath);
        console.log(`OK: Imagen "${filename}" copiada a "${path.relative(__dirname, PUBLIC_IMAGES_DIR)}".`);
        cambiosRealizados = true;
      } catch (error) {
        console.error(`FALLO: Error al copiar imagen "${filename}". ${error.message}`);
        return; // No procesar la entrada JSON si la imagen no se pudo copiar.
      }

      // Actualizo o creo la entrada del maillot.
      if (maillotsMap.has(noModelo)) {
        const existingEntry = maillotsMap.get(noModelo);
        if (existingEntry.imagenLocal !== imagenLocalUrl) { // Actualizar solo si la ruta de imagen cambió.
          existingEntry.imagenLocal = imagenLocalUrl;
          console.log(`INFO: Ruta de imagen actualizada para nºModelo "${noModelo}".`);
          cambiosRealizados = true;
        }
      } else {
        maillotsMap.set(noModelo, {
          nºModelo: noModelo,
          imagenLocal: imagenLocalUrl,
          etiquetas: [] // Los nuevos modelos comienzan sin etiquetas.
        });
        console.log(`INFO: Nuevo nºModelo "${noModelo}" añadido al catálogo.`);
        cambiosRealizados = true;
      }
    } else if (stat.isFile()) {
      console.log(`AVISO: Archivo "${filename}" omitido (no es una imagen con extensión válida).`);
    }
  });

  // Guardo la lista actualizada y ordenada en el archivo JSON.
  const updatedMaillotsArray = Array.from(maillotsMap.values());
  updatedMaillotsArray.sort(ordenacionNaturalMaillots);

  try {
    fs.writeFileSync(MAILLOTS_JSON_PATH, JSON.stringify(updatedMaillotsArray, null, 2), 'utf-8');
    if (cambiosRealizados) {
      console.log(`¡ÉXITO! Catálogo actualizado. "${path.basename(MAILLOTS_JSON_PATH)}" guardado.`);
    } else {
      console.log(`INFO: No hubo cambios en imágenes o datos, pero "${path.basename(MAILLOTS_JSON_PATH)}" fue reordenado/guardado.`);
    }
  } catch (error) {
      console.error(`FALLO CRÍTICO: No se pudo escribir en "${MAILLOTS_JSON_PATH}". ${error.message}`);
  }
}

// --- EJECUCIÓN ---
actualizarCatalogo();