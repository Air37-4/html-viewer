// Global state
let selectedFiles = [];
let currentFileIndex = -1;
const STORAGE_KEY = 'htmlViewerFiles';

// DOM elements
const fileInput = document.getElementById('fileInput');
const fileListSection = document.getElementById('fileListSection');
const fileList = document.getElementById('fileList');
const previewSection = document.getElementById('previewSection');
const viewerFrame = document.getElementById('viewerFrame');
const currentFileName = document.getElementById('currentFileName');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// Event listeners
fileInput.addEventListener('change', handleFileSelection);

// Initialize - load saved files on startup
document.addEventListener('DOMContentLoaded', () => {
    loadSavedFiles();
});

/**
 * Load saved files from localStorage
 */
function loadSavedFiles() {
    try {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
            const filesData = JSON.parse(savedData);

            if (filesData && filesData.length > 0) {
                // Convert saved data back to file-like objects
                selectedFiles = filesData.map(fileData => ({
                    name: fileData.name,
                    content: fileData.content,
                    type: 'text/html',
                    savedDate: fileData.savedDate,
                    isSaved: true
                }));

                // Display file list
                displayFileList();

                // Load first file
                if (selectedFiles.length > 0) {
                    loadSavedFile(0);
                }

                console.log(`Загружено ${selectedFiles.length} сохраненных файлов`);
            }
        }
    } catch (error) {
        console.error('Ошибка при загрузке сохраненных файлов:', error);
        showError('Не удалось загрузить сохраненные файлы');
    }
}

/**
 * Save files to localStorage
 */
function saveFilesToStorage() {
    try {
        const filesToSave = selectedFiles.map(file => ({
            name: file.name,
            content: file.content || file.cachedContent,
            savedDate: new Date().toISOString()
        }));

        localStorage.setItem(STORAGE_KEY, JSON.stringify(filesToSave));
        console.log(`Сохранено ${filesToSave.length} файлов в localStorage`);

        // Show success message
        showSuccess('Файлы сохранены локально');
    } catch (error) {
        console.error('Ошибка при сохранении файлов:', error);

        if (error.name === 'QuotaExceededError') {
            showError('Недостаточно места для сохранения файлов. Попробуйте удалить некоторые файлы.');
        } else {
            showError('Не удалось сохранить файлы');
        }
    }
}

/**
 * Clear all saved files from localStorage
 */
function clearSavedFiles() {
    if (confirm('Вы уверены, что хотите удалить все сохраненные файлы?')) {
        localStorage.removeItem(STORAGE_KEY);
        selectedFiles = [];
        currentFileIndex = -1;

        // Hide sections
        fileListSection.style.display = 'none';
        previewSection.style.display = 'none';

        showSuccess('Все сохраненные файлы удалены');
        console.log('Сохраненные файлы очищены');
    }
}

/**
 * Handle file selection event
 * @param {Event} event - The change event from file input
 */
function handleFileSelection(event) {
    const files = event.target.files;

    // Clear previous error
    hideError();

    // Validate files
    if (!files || files.length === 0) {
        showError('Файлы не выбраны. Пожалуйста, выберите хотя бы один HTML-файл.');
        return;
    }

    // Process files
    processNewFiles(Array.from(files));
}

/**
 * Process newly selected files
 * @param {Array} files - Array of File objects
 */
function processNewFiles(files) {
    let processedCount = 0;
    const totalFiles = files.length;

    files.forEach((file, index) => {
        const reader = new FileReader();

        reader.onload = function (e) {
            const htmlContent = e.target.result;

            // Add file with content to selectedFiles
            selectedFiles.push({
                name: file.name,
                content: htmlContent,
                type: file.type,
                size: file.size,
                isSaved: false
            });

            processedCount++;

            // When all files are processed
            if (processedCount === totalFiles) {
                // Save to localStorage
                saveFilesToStorage();

                // Display file list
                displayFileList();

                // Load first new file
                const firstNewIndex = selectedFiles.length - totalFiles;
                loadSavedFile(firstNewIndex);
            }
        };

        reader.onerror = function () {
            showError(`Не удалось прочитать файл "${file.name}"`);
            processedCount++;
        };

        reader.readAsText(file);
    });
}

/**
 * Display list of selected files
 */
function displayFileList() {
    // Clear existing list
    fileList.innerHTML = '';

    // Show file list section
    fileListSection.style.display = 'block';

    // Create list items
    selectedFiles.forEach((file, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'file-list-item';

        const savedIndicator = file.savedDate ?
            `<span class="saved-badge" title="Сохранено ${new Date(file.savedDate).toLocaleString('ru-RU')}">💾</span>` : '';

        listItem.innerHTML = `
            <span class="file-icon">📄</span>
            <span class="file-name">${escapeHtml(file.name)}</span>
            ${savedIndicator}
            <button class="delete-btn" title="Удалить файл" onclick="deleteFile(${index}); event.stopPropagation();">🗑️</button>
        `;

        // Add click event
        listItem.addEventListener('click', () => loadSavedFile(index));

        fileList.appendChild(listItem);
    });

    // Mark first item as active
    if (fileList.children.length > 0) {
        fileList.children[0].classList.add('active');
    }
}

/**
 * Load saved file (from memory)
 * @param {number} index - Index of file in selectedFiles array
 */
function loadSavedFile(index) {
    if (index < 0 || index >= selectedFiles.length) {
        showError('Неверный индекс файла.');
        return;
    }

    const file = selectedFiles[index];
    currentFileIndex = index;

    // Update active state in file list
    updateActiveFileItem(index);

    try {
        // Display in iframe
        displayHtmlInIframe(file.content);

        // Update current file name
        currentFileName.textContent = file.name;

        // Show preview section
        previewSection.style.display = 'flex';

        // Hide error
        hideError();

    } catch (error) {
        showError(`Ошибка при отображении файла: ${error.message}`);
    }
}

/**
 * Delete a file from the list
 * @param {number} index - Index of file to delete
 */
function deleteFile(index) {
    if (confirm(`Удалить файл "${selectedFiles[index].name}"?`)) {
        selectedFiles.splice(index, 1);

        // Save updated list
        saveFilesToStorage();

        // Update display
        if (selectedFiles.length > 0) {
            displayFileList();

            // Load another file if the deleted one was active
            if (index === currentFileIndex) {
                const newIndex = Math.min(index, selectedFiles.length - 1);
                loadSavedFile(newIndex);
            } else if (index < currentFileIndex) {
                currentFileIndex--;
            }
        } else {
            // No files left
            fileListSection.style.display = 'none';
            previewSection.style.display = 'none';
            currentFileIndex = -1;
        }

        showSuccess('Файл удален');
    }
}

/**
 * Display HTML content in iframe
 * @param {string} htmlContent - HTML content to display
 */
function displayHtmlInIframe(htmlContent) {
    try {
        // Get iframe document
        const iframeDoc = viewerFrame.contentWindow.document;

        // Open document for writing
        iframeDoc.open();

        // Write HTML content
        iframeDoc.write(htmlContent);

        // Close document
        iframeDoc.close();

    } catch (error) {
        throw new Error(`Не удалось отобразить HTML: ${error.message}`);
    }
}

/**
 * Update active state for file list items
 * @param {number} activeIndex - Index of active file
 */
function updateActiveFileItem(activeIndex) {
    const items = fileList.children;

    for (let i = 0; i < items.length; i++) {
        if (i === activeIndex) {
            items[i].classList.add('active');
        } else {
            items[i].classList.remove('active');
        }
    }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
    errorMessage.className = 'error-message';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

/**
 * Show success message
 * @param {string} message - Success message to display
 */
function showSuccess(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
    errorMessage.className = 'error-message success-message';

    // Auto-hide after 3 seconds
    setTimeout(() => {
        hideError();
    }, 3000);
}

/**
 * Hide error/success message
 */
function hideError() {
    errorMessage.style.display = 'none';
    errorText.textContent = '';
    errorMessage.className = 'error-message';
}

/**
 * Escape HTML to prevent XSS in file names
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
console.log('HTML Viewer initialized with localStorage support');
