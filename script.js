(() => {
  const STORAGE_KEY = 'htmlViewerSavedFiles';
  const LAST_VIEWED_KEY = 'htmlViewerLastViewed';

  const fileInput = document.getElementById('fileInput');
  const fileButtonsContainer = document.getElementById('fileButtons');
  const statusMessage = document.getElementById('statusMessage');
  const viewerFrame = document.getElementById('viewerFrame');
  const fileListSection = document.querySelector('.file-list');

  let storedFiles = [];
  let activeFileId = null;
  let storageEnabled = true;

  const setStatus = (message, type = 'info') => {
    statusMessage.textContent = message;
    statusMessage.classList.remove('error', 'success');
    if (type === 'error') {
      statusMessage.classList.add('error');
    } else if (type === 'success') {
      statusMessage.classList.add('success');
    }
  };

  try {
    const probeKey = '__htmlViewerProbe__';
    localStorage.setItem(probeKey, 'ok');
    localStorage.removeItem(probeKey);
  } catch (error) {
    storageEnabled = false;
    console.warn('LocalStorage is not available:', error);
    setStatus('Safari не разрешил сохранять файлы. Они будут доступны пока открыт экран.', 'error');
  }

  const safeParseStored = () => {
    if (!storageEnabled) return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Cannot parse saved files:', error);
      setStatus('Не удалось прочитать сохранённые файлы.', 'error');
      return [];
    }
  };

  const persistStoredFiles = () => {
    if (!storageEnabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFiles));
    } catch (error) {
      console.error('Cannot save files:', error);
      setStatus('Не удалось сохранить файлы в памяти браузера.', 'error');
    }
  };

  const loadLastViewed = () => {
    if (!storageEnabled) return null;
    try {
      return localStorage.getItem(LAST_VIEWED_KEY);
    } catch (error) {
      console.error('Cannot read last viewed id:', error);
      return null;
    }
  };

  const persistLastViewed = (id) => {
    if (!storageEnabled) return;
    try {
      if (id) {
        localStorage.setItem(LAST_VIEWED_KEY, id);
      } else {
        localStorage.removeItem(LAST_VIEWED_KEY);
      }
    } catch (error) {
      console.error('Cannot store last viewed id:', error);
    }
  };

  const clearViewer = () => {
    const doc = viewerFrame.contentWindow.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; color: #444; padding: 1rem;">Выберите или сохраните HTML-файл, чтобы увидеть его содержимое.</body></html>');
    doc.close();
  };

  const generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Ошибка чтения файла'));
    reader.readAsText(file, 'UTF-8');
  });

  const renderFileButtons = () => {
    fileButtonsContainer.innerHTML = '';

    if (!storedFiles.length) {
      fileListSection.classList.add('hidden');
      if (storageEnabled) {
        setStatus('Сохранённых файлов пока нет. Загрузите HTML выше.');
      }
      activeFileId = null;
      persistLastViewed(null);
      clearViewer();
      return;
    }

    fileListSection.classList.remove('hidden');

    storedFiles.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'file-item';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'file-button';
      openButton.textContent = file.name;
      openButton.dataset.id = file.id;
      if (file.id === activeFileId) {
        openButton.classList.add('active');
      }
      openButton.addEventListener('click', () => loadFileById(file.id));

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-button';
      removeButton.setAttribute('aria-label', `Удалить ${file.name}`);
      removeButton.innerHTML = '&times;';
      removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        removeFile(file.id);
      });

      item.append(openButton, removeButton);
      fileButtonsContainer.appendChild(item);
    });
  };

  const updateActiveButton = () => {
    const buttons = fileButtonsContainer.querySelectorAll('.file-button');
    buttons.forEach((button) => {
      if (button.dataset.id === activeFileId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  };

  const loadFileById = (id) => {
    const file = storedFiles.find((entry) => entry.id === id);
    if (!file) {
      setStatus('Файл не найден. Возможно, он был удалён.', 'error');
      return;
    }

    try {
      const doc = viewerFrame.contentWindow.document;
      doc.open();
      doc.write(file.content);
      doc.close();
      activeFileId = id;
      persistLastViewed(id);
      setStatus(`Показан файл: ${file.name}`, 'success');
      updateActiveButton();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось отобразить файл. Попробуйте другой.', 'error');
    }
  };

  const removeFile = (id) => {
    const index = storedFiles.findIndex((file) => file.id === id);
    if (index < 0) return;

    const wasActive = activeFileId === id;
    const [removed] = storedFiles.splice(index, 1);
    persistStoredFiles();

    renderFileButtons();

    if (wasActive) {
      activeFileId = null;
      persistLastViewed(null);
      if (storedFiles.length) {
        loadFileById(storedFiles[0].id);
      } else {
        clearViewer();
      }
    }

    setStatus(`Файл «${removed.name}» удалён из списка.`, 'info');
  };

  const handleFilesSelected = async (fileList) => {
    const chosenFiles = Array.from(fileList || []);
    if (!chosenFiles.length) return;

    setStatus('Сохраняем выбранные файлы...');

    try {
      const readResults = await Promise.all(
        chosenFiles.map(async (file) => ({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          content: await readFileAsText(file),
          addedAt: Date.now(),
        })),
      );

      let firstNewId = null;

      readResults.forEach((result) => {
        const existingIndex = storedFiles.findIndex(
          (stored) =>
            stored.name === result.name &&
            stored.size === result.size &&
            stored.lastModified === result.lastModified,
        );

        if (existingIndex >= 0) {
          const preservedId = storedFiles[existingIndex].id;
          const preservedAddedAt = storedFiles[existingIndex].addedAt;
          storedFiles[existingIndex] = {
            ...result,
            id: preservedId,
            addedAt: preservedAddedAt,
          };
          if (!firstNewId) firstNewId = preservedId;
        } else {
          const newId = generateId();
          storedFiles.push({ ...result, id: newId });
          if (!firstNewId) firstNewId = newId;
        }
      });

      persistStoredFiles();
      renderFileButtons();

      if (firstNewId) {
        loadFileById(firstNewId);
      }

      setStatus('Файлы сохранены. Они останутся до удаления.', 'success');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сохранить выбранные файлы.', 'error');
    } finally {
      fileInput.value = '';
    }
  };

  fileInput.addEventListener('change', (event) => {
    handleFilesSelected(event.target.files);
  });

  // Инициализация сохранённых данных
  storedFiles = safeParseStored();
  activeFileId = loadLastViewed();

  renderFileButtons();

  if (activeFileId && storedFiles.some((file) => file.id === activeFileId)) {
    loadFileById(activeFileId);
  } else if (storedFiles.length) {
    loadFileById(storedFiles[0].id);
  } else {
    clearViewer();
  }
})();
