// =================================================================================
// I. CONSTANTES Y CONFIGURACIÓN
// =================================================================================
//const API_BASE_URL = 'http://localhost:3001/api';
const API_BASE_URL = 'https://catalogo-maillots-rc.onrender.com/api'; // URL DE TU BACKEND EN RENDER
// LOCAL_STORAGE_KEY se usa solo para SESSION_AUTH_KEY si esta última no se usara directamente.
// const LOCAL_STORAGE_KEY = 'misMaillotsData'; 
const RANDOM_ITEMS_COUNT = 6; // Número de maillots aleatorios a mostrar. Considera si es un buen número.
const ITEMS_PER_PAGE = 20;   // Maillots por página en el catálogo. Considera si es un buen número.
const EDIT_PASSWORD = "ritmicacenter"; // Contraseña para habilitar la edición. ¡CAMBIAR EN PRODUCCIÓN!
const SESSION_AUTH_KEY = 'maillotEditorAutenticado'; // Clave para sessionStorage de autenticación.

// =================================================================================
// II. SELECTORES DE ELEMENTOS DOM
// =================================================================================
const randomMaillotListContainer = document.getElementById('randomMaillotListContainer');
const paginatedMaillotListContainer = document.getElementById('paginatedMaillotListContainer');
const paginationControlsContainer = document.getElementById('paginationControlsContainer');
const searchInput = document.getElementById('searchInput');

// Selectores del Modal de Edición
const modal = document.getElementById('editTagsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalMaillotNoTitulo = document.getElementById('modalMaillotNoTitulo');
const modalMaillotImagen = document.getElementById('modalMaillotImagen');
const modalCurrentTagsContainer = document.getElementById('modalCurrentTags');
const newTagInput = document.getElementById('newTagInput');
const addNewTagBtn = document.getElementById('addNewTagBtn');
const saveTagsChangesBtn = document.getElementById('saveTagsChangesBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

// =================================================================================
// III. ESTADO DE LA APLICACIÓN
// =================================================================================
let allMaillots = []; // Array con todos los maillots cargados desde el backend.
let currentFilteredAndSortedMaillots = []; // Array para la vista paginada (puede ser `allMaillots` o una versión filtrada).
let maillotNoSiendoEditado = null; // Almacena el nºModelo del maillot que se está editando.
let estaAutenticadoEnSesion = false; // Flag para saber si se ha introducido la contraseña en la sesión actual.
let currentPage = 1; // Página actual para la paginación del catálogo.
let etiquetasTemporalesEnModal = []; // Almacena etiquetas mientras se editan en el modal.

// Comprueba el estado de autenticación de la sesión al cargar la página.
if (sessionStorage.getItem(SESSION_AUTH_KEY) === 'true') {
  estaAutenticadoEnSesion = true;
  console.log('Usuario ya autenticado en esta sesión.');
}

// =================================================================================
// IV. FUNCIONES AUXILIARES / UTILIDADES
// =================================================================================

// Normaliza un texto para búsqueda: minúsculas y sin espacios.
function normalizarParaBusqueda(texto) {
  if (typeof texto !== 'string') {
    return '';
  }
  return texto.toLowerCase().replace(/\s+/g, '');
}

// Ordena maillots alfanuméricamente por nºModelo (ej: "2A" antes de "10A").
function ordenacionNaturalMaillots(a, b) {
  const maillotA_No = String(a.nºModelo).toUpperCase();
  const maillotB_No = String(b.nºModelo).toUpperCase();
  const re = /([A-Z]*)(\d+)([A-Z]*)|([A-Z]+)|(\d+)/g;
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

// Crea y devuelve el elemento DOM para un maillot individual.
function crearElementoMaillot(maillot) {
  const div = document.createElement('div');
  div.classList.add('maillot-item');
  div.innerHTML = `
    <strong>Modelo ${maillot.nºModelo}</strong>
    <img src="${maillot.imagenLocal}" alt="Maillot ${maillot.nºModelo}">
    <div class="tags">Etiquetas: ${maillot.etiquetas.join(', ')}</div>
    <button class="edit-tags-btn" data-maillot-no="${maillot.nºModelo}">Editar Etiquetas</button>
  `;
  return div;
}

// Asigna una puntuación de relevancia a un maillot basado en el término de búsqueda.
function getMatchScore(maillot, terminoNormalizado) {
  const modeloNormalizado = normalizarParaBusqueda(String(maillot.nºModelo));

  if (modeloNormalizado === terminoNormalizado) return 1; // Coincidencia exacta de nºModelo.
  if (modeloNormalizado.startsWith(terminoNormalizado)) return 2; // nºModelo comienza con el término.
  if (modeloNormalizado.includes(terminoNormalizado)) return 3; // nºModelo contiene el término.
  
  const tieneCoincidenciaEtiqueta = maillot.etiquetas.some(etiqueta => 
    normalizarParaBusqueda(etiqueta).includes(terminoNormalizado)
  );
  if (tieneCoincidenciaEtiqueta) return 4; // Coincidencia en etiqueta.
  
  return 5; // Sin coincidencia fuerte.
}

// Ordena un array de resultados de búsqueda por relevancia y luego por nºModelo.
function sortSearchResults(resultados, terminoNormalizado) {
  resultados.sort((a, b) => {
    const scoreA = getMatchScore(a, terminoNormalizado);
    const scoreB = getMatchScore(b, terminoNormalizado);
    if (scoreA !== scoreB) {
      return scoreA - scoreB; // Menor puntaje (mayor relevancia) primero.
    }
    return ordenacionNaturalMaillots(a, b); // Desempate con orden natural.
  });
  return resultados; 
}

// Formatea una etiqueta individual: mayúsculas, solo letras/espacios/caracteres españoles.
function formatearEtiquetaIndividual(textoEtiqueta) {
  if (typeof textoEtiqueta !== 'string') return null;
  let textoProcesado = textoEtiqueta.trim();
  if (textoProcesado === '') return null;
  
  textoProcesado = textoProcesado.toUpperCase();
  textoProcesado = textoProcesado.replace(/[^A-ZÑÁÉÍÓÚÜ\s]/g, ''); // Permite letras, Ñ, acentos y espacios.
  textoProcesado = textoProcesado.replace(/\s+/g, ' ').trim(); // Normaliza múltiples espacios a uno.
  
  return textoProcesado.length > 0 ? textoProcesado : null;
}

// =================================================================================
// V. FUNCIONES DE LOCALSTORAGE 
// (Actualmente no se usa para persistir allMaillots, solo para el flag de sesión de contraseña)
// =================================================================================
/* function guardarMaillotsEnLocalStorage() { // Comentada porque el backend es la fuente de verdad.
  // ...
}
*/

// =================================================================================
// VI. LÓGICA PRINCIPAL DE DATOS
// =================================================================================

// Carga los maillots iniciales desde el backend.
async function cargarMaillotsIniciales() {
  console.log(`Cargando maillots desde el backend: ${API_BASE_URL}/maillots ...`);
  try {
    const response = await fetch(`${API_BASE_URL}/maillots`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Error del backend: ${response.status} - ${errorData.message || 'No se pudo obtener datos'}`);
    }
    allMaillots = await response.json();
    
    if (!Array.isArray(allMaillots)) {
      console.warn('Los datos recibidos del backend no son un array. Se usará un array vacío.');
      allMaillots = [];
    }
    console.log('Datos de maillots procesados desde el backend:', allMaillots);
    procesarYMostrarMaillots();
  } catch (error) {
    console.error("Error cargando maillots desde el backend:", error);
    if (paginatedMaillotListContainer) paginatedMaillotListContainer.innerHTML = `<p>Error al cargar los datos: ${error.message}. Asegúrate de que el servidor backend esté funcionando.</p>`;
    if (randomMaillotListContainer) randomMaillotListContainer.innerHTML = '<p>Error al cargar los datos.</p>';
    allMaillots = []; 
    procesarYMostrarMaillots(); // Intenta renderizar (probablemente mostrará "No hay maillots").
  }
}

// Procesa los maillots cargados (ordena) y llama a las funciones de renderizado inicial.
function procesarYMostrarMaillots() {
  allMaillots.sort(ordenacionNaturalMaillots); // Ordena la lista principal.
  
  // Prepara la lista para la vista paginada (inicialmente, todos los maillots).
  // Esta función se encarga de filtrar y luego renderizar.
  actualizarVistaFiltradaYRenderizar(); 
  renderRandomMaillots(); // La lista aleatoria se basa en allMaillots, así que se renderiza aquí.
}

// NUEVA FUNCIÓN: Centraliza la lógica de filtrado y actualización de la vista paginada.
function actualizarVistaFiltradaYRenderizar(terminoDeBusqueda = null) {
    const terminoNormalizado = terminoDeBusqueda ? normalizarParaBusqueda(terminoDeBusqueda) : normalizarParaBusqueda(searchInput ? searchInput.value.trim() : "");

    if (!terminoNormalizado) {
        currentFilteredAndSortedMaillots = [...allMaillots]; // Muestra todos si no hay búsqueda.
    } else {
        let filteredResults = allMaillots.filter(maillot => {
            const modeloNormalizado = normalizarParaBusqueda(String(maillot.nºModelo));
            const coincidenciaModelo = modeloNormalizado.includes(terminoNormalizado);
            const coincidenciaEtiqueta = maillot.etiquetas.some(etiqueta =>
                normalizarParaBusqueda(etiqueta).includes(terminoNormalizado)
            );
            return coincidenciaModelo || coincidenciaEtiqueta;
        });
        sortSearchResults(filteredResults, terminoNormalizado); // Ordena por relevancia.
        currentFilteredAndSortedMaillots = filteredResults;
    }
    // currentPage ya se resetea en el listener de searchInput si es una nueva búsqueda.
    // Si esta función se llama desde otro sitio (ej. después de editar), currentPage se mantendría.
    renderPaginatedList();
}


// =================================================================================
// VII. FUNCIONES DE RENDERIZADO (Actualización de UI)
// =================================================================================

// Muestra una selección aleatoria de maillots.
function renderRandomMaillots() {
  if (!randomMaillotListContainer) return;
  randomMaillotListContainer.innerHTML = '';
  if (!allMaillots || allMaillots.length === 0) {
    randomMaillotListContainer.innerHTML = "<p>No hay modelos para mostrar aleatoriamente.</p>";
    return;
  }
  const shuffled = [...allMaillots].sort(() => 0.5 - Math.random());
  const randomSelection = shuffled.slice(0, RANDOM_ITEMS_COUNT);
  randomSelection.forEach(maillot => {
    randomMaillotListContainer.appendChild(crearElementoMaillot(maillot));
  });
}

// Muestra la página actual de maillots en el catálogo paginado.
function renderPaginatedList() {
  if (!paginatedMaillotListContainer) return;
  paginatedMaillotListContainer.innerHTML = '';

  if (!currentFilteredAndSortedMaillots || currentFilteredAndSortedMaillots.length === 0) {
    if (searchInput && searchInput.value.trim() !== '') {
      paginatedMaillotListContainer.innerHTML = '<p>No se encontraron maillots para tu búsqueda.</p>';
    } else {
      paginatedMaillotListContainer.innerHTML = '<p>No hay maillots en el catálogo.</p>';
    }
  } else {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const itemsForCurrentPage = currentFilteredAndSortedMaillots.slice(startIndex, endIndex);
    itemsForCurrentPage.forEach(maillot => {
      paginatedMaillotListContainer.appendChild(crearElementoMaillot(maillot));
    });
  }
  renderPaginationControls(); // Siempre actualiza los controles de paginación.
}

// Genera y muestra los controles de paginación.
function renderPaginationControls() {
  if (!paginationControlsContainer) return;
  paginationControlsContainer.innerHTML = '';
  if (!currentFilteredAndSortedMaillots || currentFilteredAndSortedMaillots.length === 0) return;

  const totalPages = Math.ceil(currentFilteredAndSortedMaillots.length / ITEMS_PER_PAGE);
  if (totalPages <= 1) return; // No se necesitan controles para una sola página o menos.

  // Botón "Anterior"
  const prevButton = document.createElement('button');
  prevButton.textContent = 'Anterior';
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderPaginatedList();
    }
  });
  paginationControlsContainer.appendChild(prevButton);

  // Lógica para mostrar números de página (ej: 1 ... 4 5 6 ... 10)
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);
  if (currentPage <= 3) endPage = Math.min(totalPages, 5); // Ajuste para primeras páginas
  if (currentPage > totalPages - 3) startPage = Math.max(1, totalPages - 4); // Ajuste para últimas páginas

  if (startPage > 1) {
    const firstPageButton = document.createElement('button');
    firstPageButton.textContent = '1';
    firstPageButton.addEventListener('click', () => { currentPage = 1; renderPaginatedList(); });
    paginationControlsContainer.appendChild(firstPageButton);
    if (startPage > 2) {
      const dots = document.createElement('span');
      dots.classList.add('pagination-dots'); // Clase para posible estilo de los "..."
      dots.textContent = '...';
      paginationControlsContainer.appendChild(dots);
    }
  }
  
  for (let i = startPage; i <= endPage; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    if (i === currentPage) {
      pageButton.classList.add('active-page');
      pageButton.disabled = true;
    }
    pageButton.addEventListener('click', () => { currentPage = i; renderPaginatedList(); });
    paginationControlsContainer.appendChild(pageButton);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement('span');
      dots.classList.add('pagination-dots');
      dots.textContent = '...';
      paginationControlsContainer.appendChild(dots);
    }
    const lastPageButton = document.createElement('button');
    lastPageButton.textContent = totalPages;
    lastPageButton.addEventListener('click', () => { currentPage = totalPages; renderPaginatedList(); });
    paginationControlsContainer.appendChild(lastPageButton);
  }

  // Botón "Siguiente"
  const nextButton = document.createElement('button');
  nextButton.textContent = 'Siguiente';
  nextButton.disabled = currentPage === totalPages;
  nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderPaginatedList();
    }
  });
  paginationControlsContainer.appendChild(nextButton);
}

// =================================================================================
// VIII. LÓGICA DEL MODAL DE EDICIÓN DE ETIQUETAS
// =================================================================================

// Muestra las etiquetas actuales (temporales) en el modal.
function renderEtiquetasEnModal() {
  if (!modalCurrentTagsContainer) return;
  modalCurrentTagsContainer.innerHTML = '';
  etiquetasTemporalesEnModal.forEach((tag, index) => {
    const tagChip = document.createElement('span');
    tagChip.classList.add('tag-chip');
    tagChip.textContent = tag;
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-tag-btn');
    deleteBtn.innerHTML = '&times;'; // Símbolo 'x' para borrar.
    deleteBtn.onclick = function() {
      etiquetasTemporalesEnModal.splice(index, 1); // Elimina del array temporal.
      renderEtiquetasEnModal(); // Re-dibuja las etiquetas en el modal.
    };
    tagChip.appendChild(deleteBtn);
    modalCurrentTagsContainer.appendChild(tagChip);
  });
}

// Prepara y muestra el modal para editar etiquetas de un maillot específico.
function abrirModalEdicionEtiquetas(maillotNo) {
  maillotNoSiendoEditado = maillotNo;
  const maillot = allMaillots.find(m => m.nºModelo === maillotNo);
  if (!maillot) {
      console.error(`No se encontró el maillot con nºModelo: ${maillotNo} para editar.`);
      return;
  }

  if (modalMaillotNoTitulo) modalMaillotNoTitulo.textContent = maillotNo;
  if (modalMaillotImagen) {
    modalMaillotImagen.src = maillot.imagenLocal;
    modalMaillotImagen.alt = `Maillot ${maillot.nºModelo}`;
  }
  
  etiquetasTemporalesEnModal = [...maillot.etiquetas]; // Copia para edición temporal.
  renderEtiquetasEnModal();
  
  if (newTagInput) newTagInput.value = '';
  if (modal) modal.style.display = 'flex'; // Muestra el modal.
}

// Oculta el modal y resetea el estado de edición.
function cerrarModal() {
  if (modal) modal.style.display = 'none';
  if (modalMaillotImagen) {
    modalMaillotImagen.src = ""; 
    modalMaillotImagen.alt = "Imagen del Maillot";
  }
  maillotNoSiendoEditado = null;
  etiquetasTemporalesEnModal = [];
}

// =================================================================================
// IX. MANEJADORES DE EVENTOS
// =================================================================================

// Manejador para el input de búsqueda.
if (searchInput) {
  searchInput.addEventListener('input', (event) => {
    currentPage = 1; // Siempre resetea a la primera página al cambiar el término de búsqueda.
    actualizarVistaFiltradaYRenderizar(event.target.value.trim());
  });
}

// Manejador global de clics en la app (para delegación de eventos, ej: botones "Editar").
const appElement = document.getElementById('app');
if (appElement) {
  appElement.addEventListener('click', function(event) {
    // Lógica para el botón "Editar Etiquetas".
    if (event.target.classList.contains('edit-tags-btn')) {
      const maillotNo = event.target.dataset.maillotNo;
      if (estaAutenticadoEnSesion) {
        abrirModalEdicionEtiquetas(maillotNo);
      } else {
        const passwordIngresada = prompt("Por favor, introduce la contraseña para editar:");
        if (passwordIngresada === null) return; // Usuario canceló.
        
        if (passwordIngresada === EDIT_PASSWORD) {
          estaAutenticadoEnSesion = true;
          sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
          abrirModalEdicionEtiquetas(maillotNo);
        } else {
          alert("Contraseña incorrecta. No tienes permiso para editar.");
          estaAutenticadoEnSesion = false; // Resetear por si intentan de nuevo.
          sessionStorage.removeItem(SESSION_AUTH_KEY);
        }
      }
    }
  });
}

// --- Manejadores de eventos para los elementos DENTRO del Modal de Edición ---
if (addNewTagBtn) {
  addNewTagBtn.addEventListener('click', function() {
    if (!newTagInput) return;
    const valorInputCompleto = newTagInput.value;
    if (valorInputCompleto.trim() === '') {
      alert('La entrada de etiquetas no puede estar vacía.');
      newTagInput.focus();
      return;
    }

    const etiquetasPotenciales = valorInputCompleto.split(',');
    let etiquetasAñadidasConExito = 0;
    let etiquetasInvalidasIgnoradas = [];
    let etiquetasDuplicadasIgnoradas = 0;

    etiquetasPotenciales.forEach(textoEtiquetaIndividual => {
      const etiquetaFormateada = formatearEtiquetaIndividual(textoEtiquetaIndividual);
      if (etiquetaFormateada) {
        if (etiquetasTemporalesEnModal.includes(etiquetaFormateada)) {
          etiquetasDuplicadasIgnoradas++;
        } else {
          etiquetasTemporalesEnModal.push(etiquetaFormateada);
          etiquetasAñadidasConExito++;
        }
      } else if (textoEtiquetaIndividual.trim() !== '') { 
        etiquetasInvalidasIgnoradas.push(textoEtiquetaIndividual.trim());
      }
    });

    if (etiquetasAñadidasConExito > 0) renderEtiquetasEnModal();
    newTagInput.value = '';
    newTagInput.focus();

    // Feedback al usuario (simplificado para evitar múltiples alerts).
    if (etiquetasInvalidasIgnoradas.length > 0 || etiquetasDuplicadasIgnoradas > 0) {
      let msj = [];
      if (etiquetasInvalidasIgnoradas.length > 0) msj.push(`Algunas entradas fueron ignoradas por formato inválido: "${etiquetasInvalidasIgnoradas.join('", "')}".`);
      if (etiquetasDuplicadasIgnoradas > 0) msj.push(`${etiquetasDuplicadasIgnoradas} etiqueta(s) ya existían.`);
      if (etiquetasAñadidasConExito === 0 && etiquetasInvalidasIgnoradas.length + etiquetasDuplicadasIgnoradas > 0){
        // Si no se añadió nada pero hubo intentos.
      } else if (etiquetasAñadidasConExito > 0) {
         msj.unshift(`${etiquetasAñadidasConExito} etiqueta(s) procesada(s).`);
      }
      if (msj.length > 0) alert(msj.join('\n'));
    }
  });
}

if (newTagInput) { // Permite añadir etiqueta presionando Enter.
  newTagInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Evita que el Enter haga submit si estuviera en un form.
      if (addNewTagBtn) addNewTagBtn.click(); // Simula click en el botón de añadir.
    }
  });
}

if (saveTagsChangesBtn) { // Guarda los cambios de etiquetas en el backend.
  saveTagsChangesBtn.addEventListener('click', async function() {
    if (!maillotNoSiendoEditado) {
        console.warn("Intento de guardar sin maillotNoSiendoEditado seleccionado.");
        cerrarModal();
        return;
    }

    const payload = {
      modeloNo: maillotNoSiendoEditado,
      etiquetas: [...etiquetasTemporalesEnModal],
      password: EDIT_PASSWORD 
    };
    console.log('Enviando actualización de etiquetas al backend:', payload);

    try {
      const response = await fetch(`${API_BASE_URL}/maillots/actualizar-etiquetas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error del servidor: ${response.status} ${response.statusText}` }));
        throw new Error(errorData.message);
      }

      const result = await response.json();
      console.log('Respuesta del backend al guardar:', result.message);

      // Actualiza el maillot en el array 'allMaillots' con los datos del servidor.
      const maillotIndex = allMaillots.findIndex(m => m.nºModelo === maillotNoSiendoEditado);
      if (maillotIndex !== -1 && result.maillotActualizado) {
        allMaillots[maillotIndex] = result.maillotActualizado;
      } else {
        // Fallback: si no se pudo actualizar específicamente, recargar todos los datos.
        // Esto es menos eficiente pero asegura consistencia.
        console.warn('Maillot actualizado no devuelto por backend o no encontrado localmente. Recargando todos los maillots.');
        await cargarMaillotsIniciales(); // Carga todos y re-renderiza.
        cerrarModal();
        return; // Salimos aquí ya que cargarMaillotsIniciales se encarga de re-renderizar.
      }
      
      // Refresca la vista con los datos actualizados.
      // El término de búsqueda actual se obtiene de searchInput.value para mantener el filtro.
      actualizarVistaFiltradaYRenderizar();
      renderRandomMaillots(); // La lista aleatoria también se actualiza.
      
    } catch (error) {
      console.error('Error al guardar cambios de etiquetas en el servidor:', error);
      alert(`No se pudieron guardar los cambios en el servidor: ${error.message}`);
    }
    cerrarModal();
  });
}

if (closeModalBtn) closeModalBtn.addEventListener('click', cerrarModal);
if (cancelEditBtn) cancelEditBtn.addEventListener('click', cerrarModal);

// Cierra el modal si se hace clic en el fondo oscuro.
window.addEventListener('click', function(event) {
  if (event.target === modal) { 
    cerrarModal();
  }
});

// =================================================================================
// X. INICIALIZACIÓN DE LA APLICACIÓN
// =================================================================================
console.log('Inicializando aplicación y llamando a cargarMaillotsIniciales()...');
cargarMaillotsIniciales();