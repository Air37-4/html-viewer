(() => {
  const STORAGE_KEY = 'htmlViewerSavedFiles';
  const LAST_VIEWED_KEY = 'htmlViewerLastViewed';
  const RESOURCE_KEY = 'htmlViewerSavedResources';
  const SCALE_KEY = 'htmlViewerScaleMode';

  const HTML_EXTENSIONS = new Set(['html', 'htm']);
  const TEXT_RESOURCE_EXTENSIONS = new Set(['css', 'js', 'mjs', 'json', 'svg', 'txt']);
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 1;
  const SCALE_STEP = 0.05;

  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const folderPickerButton = document.getElementById('folderPickerButton');
  const fileButtonsContainer = document.getElementById('fileButtons');
  const statusMessage = document.getElementById('statusMessage');
  const viewerFrame = document.getElementById('viewerFrame');
  const viewerFrameWrapper = document.querySelector('.viewer-frame');
  const scaleIndicator = document.getElementById('scaleIndicator');
  const fileListSection = document.querySelector('.file-list');
  const frameSupportsSrcdoc = viewerFrame && 'srcdoc' in viewerFrame;

  let storedFiles = [];
  let activeFileId = null;
  let storageEnabled = true;
  const resourceStore = new Map();
  const resourceNameIndex = new Map();
  let persistedResources = [];
  let currentFrameBlobUrl = null;

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

  const safeParseResources = () => {
    if (!storageEnabled) return [];
    try {
      const raw = localStorage.getItem(RESOURCE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Cannot parse saved resources:', error);
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

  const persistResources = () => {
    if (!storageEnabled) return;
    try {
      localStorage.setItem(RESOURCE_KEY, JSON.stringify(persistedResources));
    } catch (error) {
      console.error('Cannot save resources:', error);
      setStatus('Не удалось сохранить связанные файлы (CSS/JS).', 'error');
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

  const loadScaleMode = () => {
    if (!storageEnabled) return null;
    try {
      return localStorage.getItem(SCALE_KEY);
    } catch (error) {
      console.error('Cannot read scale mode:', error);
      return null;
    }
  };

  const persistScaleMode = (value) => {
    if (!storageEnabled) return;
    try {
      localStorage.setItem(SCALE_KEY, value);
    } catch (error) {
      console.error('Cannot store scale mode:', error);
    }
  };

  let currentScale = 1;

  const clampScale = (value) => {
    if (!Number.isFinite(value)) return 1;
    if (value < MIN_SCALE) return MIN_SCALE;
    if (value > MAX_SCALE) return MAX_SCALE;
    return value;
  };

  const applyScaleMode = (value) => {
    const numeric = clampScale(Number(value));
    currentScale = numeric;
    if (viewerFrameWrapper) {
      viewerFrameWrapper.style.setProperty('--viewer-scale', numeric);
    }
    if (scaleIndicator) {
      scaleIndicator.textContent = `Масштаб: ${Math.round(numeric * 100)}%`;
    }
    return `${numeric}`;
  };

  const renderInFrame = (html) => {
    if (!viewerFrame) return;
    if (frameSupportsSrcdoc) {
      viewerFrame.removeAttribute('src');
      viewerFrame.srcdoc = html;
      return;
    }
    if (currentFrameBlobUrl) {
      URL.revokeObjectURL(currentFrameBlobUrl);
      currentFrameBlobUrl = null;
    }
    const blob = new Blob([html], { type: 'text/html' });
    currentFrameBlobUrl = URL.createObjectURL(blob);
    viewerFrame.src = currentFrameBlobUrl;
  };

  const clearViewer = () => {
    renderInFrame('<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; color: #444; padding: 1rem;">Выберите или сохраните HTML-файл, чтобы увидеть его содержимое.</body></html>');
  };

  const generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Ошибка чтения файла'));
    reader.readAsText(file, 'UTF-8');
  });

  const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });

  const getExtension = (filename = '') => {
    const lower = filename.toLowerCase();
    const lastDot = lower.lastIndexOf('.');
    return lastDot >= 0 ? lower.slice(lastDot + 1) : '';
  };

  const guessMimeType = (filename = '', fallback = 'application/octet-stream') => {
    const ext = getExtension(filename);
    switch (ext) {
      case 'css':
        return 'text/css';
      case 'js':
      case 'mjs':
        return 'text/javascript';
      case 'json':
        return 'application/json';
      case 'svg':
        return 'image/svg+xml';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'avif':
        return 'image/avif';
      case 'ico':
        return 'image/x-icon';
      case 'mp3':
        return 'audio/mpeg';
      case 'mp4':
      case 'm4v':
      case 'mov':
        return 'video/mp4';
      case 'woff':
        return 'font/woff';
      case 'woff2':
        return 'font/woff2';
      case 'ttf':
        return 'font/ttf';
      case 'otf':
        return 'font/otf';
      default:
        return fallback;
    }
  };

  const normalizePathFragment = (input = '') => {
    if (!input) return '';
    const sanitized = input.replace(/\\/g, '/');
    const parts = sanitized.split('/');
    const stack = [];
    parts.forEach((part) => {
      if (!part || part === '.') return;
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    });
    return stack.join('/');
  };

  const getDirFromPath = (path = '') => {
    const normalized = normalizePathFragment(path);
    if (!normalized) return '';
    const idx = normalized.lastIndexOf('/');
    return idx >= 0 ? `${normalized.slice(0, idx + 1)}` : '';
  };

  const getBasename = (input = '') => {
    const normalized = input.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    return (idx >= 0 ? normalized.slice(idx + 1) : normalized).toLowerCase();
  };

  const isExternalReference = (value = '') => /^(?:[a-z][\w+\-.]*:|\/\/|#)/i.test(value.trim());

  const splitUrlTail = (value = '') => {
    let endIndex = value.length;
    const hashIndex = value.indexOf('#');
    if (hashIndex >= 0) {
      endIndex = Math.min(endIndex, hashIndex);
    }
    const queryIndex = value.indexOf('?');
    if (queryIndex >= 0) {
      endIndex = Math.min(endIndex, queryIndex);
    }
    return {
      path: value.slice(0, endIndex),
      suffix: value.slice(endIndex),
    };
  };

  const resolvePathFromBase = (baseDir, rawTarget) => {
    if (!rawTarget) return { normalized: '', suffix: '' };
    const trimmed = rawTarget.trim();
    const { path, suffix } = splitUrlTail(trimmed);
    if (!path) {
      return { normalized: '', suffix };
    }
    if (path.startsWith('/')) {
      return { normalized: normalizePathFragment(path.slice(1)), suffix };
    }
    const baseParts = baseDir ? baseDir.split('/').filter(Boolean) : [];
    const targetParts = path.replace(/\\/g, '/').split('/');
    const stack = [...baseParts];
    targetParts.forEach((part) => {
      if (!part || part === '.') return;
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    });
    return { normalized: stack.join('/'), suffix };
  };

  const registerResource = (resource, options = {}) => {
    if (!resource) return;
    const normalizedPath = normalizePathFragment(resource.path || resource.name);
    if (!normalizedPath) return;
    const entry = {
      ...resource,
      path: normalizedPath,
      basename: (resource.basename || getBasename(normalizedPath || resource.name)).toLowerCase(),
      generatedUrl: null,
    };
    const previous = resourceStore.get(entry.path);
    if (previous?.generatedUrl) {
      URL.revokeObjectURL(previous.generatedUrl);
    }
    resourceStore.set(entry.path, entry);

    if (entry.basename) {
      if (!resourceNameIndex.has(entry.basename)) {
        resourceNameIndex.set(entry.basename, new Set());
      }
      resourceNameIndex.get(entry.basename).add(entry.path);
    }

    if (entry.persistent && !options.skipPersist && storageEnabled) {
      const serializable = {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        basename: entry.basename,
        mime: entry.mime,
        encoding: entry.encoding,
        content: entry.content,
        persistent: true,
        addedAt: entry.addedAt,
      };
      const existingIndex = persistedResources.findIndex((item) => item.path === entry.path);
      if (existingIndex >= 0) {
        persistedResources[existingIndex] = serializable;
      } else {
        persistedResources.push(serializable);
      }
      persistResources();
    }
  };

  const getResourceUrl = (resource) => {
    if (!resource) return null;
    if (resource.encoding === 'data-url') {
      return resource.content;
    }
    if (!resource.generatedUrl) {
      const blob = new Blob([resource.content], { type: resource.mime || 'text/plain' });
      resource.generatedUrl = URL.createObjectURL(blob);
    }
    return resource.generatedUrl;
  };

  const findResourceCandidate = (candidates, originalValue) => {
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = normalizePathFragment(candidate);
      if (!normalized) continue;
      const resource = resourceStore.get(normalized);
      if (resource) return resource;
    }
    const fallbackName = getBasename(originalValue || '');
    if (!fallbackName) return null;
    const matches = resourceNameIndex.get(fallbackName);
    if (!matches) return null;
    for (const path of matches) {
      const resource = resourceStore.get(path);
      if (resource) return resource;
    }
    return null;
  };

  const resolveResourceReference = (rawValue, baseDir) => {
    if (!rawValue) return { skip: true };
    const trimmed = rawValue.trim();
    if (!trimmed || isExternalReference(trimmed)) return { skip: true };
    const { normalized } = resolvePathFromBase(baseDir, trimmed);
    const candidates = [];
    if (normalized) candidates.push(normalized);
    if (normalized && normalized.startsWith('./')) {
      candidates.push(normalized.replace(/^\.\//, ''));
    }
    const plain = normalizePathFragment(trimmed);
    if (plain && !candidates.includes(plain)) {
      candidates.push(plain);
    }

    const resource = findResourceCandidate(candidates, trimmed);
    if (!resource) {
      return { missing: trimmed };
    }
    return { url: getResourceUrl(resource) };
  };

  const rewriteAttributeList = (elements, attr, baseDir, missingSet) => {
    elements.forEach((element) => {
      const value = element.getAttribute(attr);
      if (!value) return;
      const resolution = resolveResourceReference(value, baseDir);
      if (resolution.url) {
        element.setAttribute(attr, resolution.url);
      } else if (resolution.missing) {
        missingSet.add(resolution.missing);
      }
    });
  };

  const rewriteSrcsetAttribute = (elements, attr, baseDir, missingSet) => {
    elements.forEach((element) => {
      const value = element.getAttribute(attr);
      if (!value) return;
      const parts = value.split(',');
      const rewritten = parts
        .map((chunk) => {
          const trimmed = chunk.trim();
          if (!trimmed) return '';
          const segments = trimmed.split(/\s+/);
          const urlPart = segments.shift();
          if (!urlPart) return trimmed;
          const resolution = resolveResourceReference(urlPart, baseDir);
          if (resolution.url) {
            return [resolution.url, ...segments].join(' ').trim();
          }
          if (resolution.missing) {
            missingSet.add(resolution.missing);
          }
          return trimmed;
        })
        .filter(Boolean);
      if (rewritten.length) {
        element.setAttribute(attr, rewritten.join(', '));
      }
    });
  };

  const composeDocumentString = (doc) => {
    const { doctype } = doc;
    let docTypeString = '<!DOCTYPE html>';
    if (doctype) {
      docTypeString = `<!DOCTYPE ${doctype.name || 'html'}${doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ''}${!doctype.publicId && doctype.systemId ? ' SYSTEM' : ''}${doctype.systemId ? ` "${doctype.systemId}"` : ''}>`;
    }
    const html = doc.documentElement ? doc.documentElement.outerHTML : '';
    return `${docTypeString}${html}`;
  };

  const buildRenderableContent = (file) => {
    if (!resourceStore.size) {
      return { html: file.content, missing: [] };
    }

    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(file.content, 'text/html');
      if (!parsed) {
        return { html: file.content, missing: [] };
      }
      const baseDir = getDirFromPath(file.path || file.name);
      const missing = new Set();

      rewriteAttributeList(parsed.querySelectorAll('script[src]'), 'src', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('link[rel~="stylesheet"][href]'), 'href', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('link[rel~="preload"][href]'), 'href', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('link[rel~="icon"][href]'), 'href', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('img[src]'), 'src', baseDir, missing);
      rewriteSrcsetAttribute(parsed.querySelectorAll('img[srcset]'), 'srcset', baseDir, missing);
      rewriteSrcsetAttribute(parsed.querySelectorAll('source[srcset]'), 'srcset', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('source[src]'), 'src', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('video[src]'), 'src', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('audio[src]'), 'src', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('track[src]'), 'src', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('object[data]'), 'data', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('embed[src]'), 'src', baseDir, missing);
      rewriteAttributeList(parsed.querySelectorAll('iframe[src]'), 'src', baseDir, missing);

      return {
        html: composeDocumentString(parsed),
        missing: Array.from(missing),
      };
    } catch (error) {
      console.error('Cannot prepare HTML with resources:', error);
      return { html: file.content, missing: [] };
    }
  };

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
      const prepared = buildRenderableContent(file);
      renderInFrame(prepared.html);
      activeFileId = id;
      persistLastViewed(id);
      if (prepared.missing.length) {
        const preview = prepared.missing.slice(0, 3).join(', ');
        const extra = prepared.missing.length > 3 ? ` и ещё ${prepared.missing.length - 3}` : '';
        setStatus(`Показан файл: ${file.name}, но не найдены ресурсы (${preview}${extra}).`, 'error');
      } else {
        setStatus(`Показан файл: ${file.name}`, 'success');
      }
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
      const processed = await Promise.all(
        chosenFiles.map(async (file) => {
          const extension = getExtension(file.name);
          if (HTML_EXTENSIONS.has(extension)) {
            return {
              kind: 'html',
              data: {
                id: generateId(),
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                addedAt: Date.now(),
                content: await readFileAsText(file),
                path: normalizePathFragment(file.webkitRelativePath || file.name) || file.name,
              },
            };
          }
          return {
            kind: 'resource',
            data: {
              id: generateId(),
              name: file.name,
              addedAt: Date.now(),
              mime: file.type || guessMimeType(file.name),
              ...(TEXT_RESOURCE_EXTENSIONS.has(extension) || (file.type && file.type.startsWith('text/')) || extension === 'svg'
                ? { encoding: 'text', content: await readFileAsText(file), persistent: true }
                : { encoding: 'data-url', content: await readFileAsDataURL(file), persistent: false }),
              path: normalizePathFragment(file.webkitRelativePath || file.name) || file.name,
            },
          };
        }),
      );

      const htmlFiles = [];
      const resourceFiles = [];

      processed.forEach((entry) => {
        if (entry.kind === 'resource') {
          resourceFiles.push(entry.data);
        } else {
          htmlFiles.push(entry.data);
        }
      });

      if (resourceFiles.length) {
        resourceFiles.forEach((resource) => registerResource(resource));
      }

      let firstNewId = null;

      htmlFiles.forEach((result) => {
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
          storedFiles.push(result);
          if (!firstNewId) firstNewId = result.id;
        }
      });

      if (htmlFiles.length) {
        persistStoredFiles();
        renderFileButtons();
      }

      if (firstNewId) {
        loadFileById(firstNewId);
      }

      const messageParts = [];
      if (htmlFiles.length) messageParts.push(`HTML: ${htmlFiles.length}`);
      if (resourceFiles.length) messageParts.push(`ресурсы: ${resourceFiles.length}`);
      if (!messageParts.length) messageParts.push('файлов');

      setStatus(`Сохранено ${messageParts.join(', ')}.`, 'success');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сохранить выбранные файлы.', 'error');
    } finally {
      fileInput.value = '';
      if (folderInput) {
        folderInput.value = '';
      }
    }
  };

  const handleScaleWheel = (event) => {
    if (!viewerFrameWrapper) return;
    if (!event.deltaY) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const nextScale = clampScale(currentScale + direction * SCALE_STEP);
    if (nextScale === currentScale) return;
    const applied = applyScaleMode(nextScale);
    persistScaleMode(applied);
  };

  fileInput.addEventListener('change', (event) => {
    handleFilesSelected(event.target.files);
  });

  if (folderPickerButton && folderInput) {
    folderPickerButton.addEventListener('click', () => folderInput.click());
  }

  if (folderInput) {
    folderInput.addEventListener('change', (event) => {
      handleFilesSelected(event.target.files);
    });
  }

  if (viewerFrameWrapper) {
    viewerFrameWrapper.addEventListener('wheel', handleScaleWheel, { passive: false });
  }

  const savedScaleMode = loadScaleMode();
  applyScaleMode(savedScaleMode || '1');

  persistedResources = safeParseResources();
  persistedResources.forEach((resource) => registerResource(resource, { skipPersist: true }));

  storedFiles = safeParseStored().map((file) => ({
    ...file,
    path: file.path ? normalizePathFragment(file.path) : normalizePathFragment(file.name) || file.name,
  }));
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
