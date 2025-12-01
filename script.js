// Global state
let selectedFiles = [];
let currentFileIndex = -1;

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
    
    // Store files
    selectedFiles = Array.from(files);
    
    // Display file list
    displayFileList();
    
    // Automatically load first file
    if (selectedFiles.length > 0) {
        loadFile(0);
    }
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
        listItem.innerHTML = `
            <span class="file-icon">📄</span>
            <span class="file-name">${escapeHtml(file.name)}</span>
        `;
        
        // Add click event
        listItem.addEventListener('click', () => loadFile(index));
        
        fileList.appendChild(listItem);
    });
    
    // Mark first item as active
    if (fileList.children.length > 0) {
        fileList.children[0].classList.add('active');
    }
}

/**
 * Load and display HTML file
 * @param {number} index - Index of file in selectedFiles array
 */
function loadFile(index) {
    if (index < 0 || index >= selectedFiles.length) {
        showError('Неверный индекс файла.');
        return;
    }
    
    const file = selectedFiles[index];
    currentFileIndex = index;
    
    // Update active state in file list
    updateActiveFileItem(index);
    
    // Check file type
    if (!file.type.includes('html') && !file.name.endsWith('.html')) {
        showError(`Файл "${file.name}" не является HTML-файлом. Пожалуйста, выберите файл с расширением .html`);
        return;
    }
    
    // Show loading state
    viewerFrame.classList.add('loading');
    
    // Read file
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const htmlContent = e.target.result;
            
            // Display in iframe
            displayHtmlInIframe(htmlContent);
            
            // Update current file name
            currentFileName.textContent = file.name;
            
            // Show preview section
            previewSection.style.display = 'flex';
            
            // Remove loading state
            viewerFrame.classList.remove('loading');
            
            // Hide error
            hideError();
            
        } catch (error) {
            showError(`Ошибка при отображении файла: ${error.message}`);
            viewerFrame.classList.remove('loading');
        }
    };
    
    reader.onerror = function() {
        showError(`Не удалось прочитать файл "${file.name}". Пожалуйста, попробуйте снова.`);
        viewerFrame.classList.remove('loading');
    };
    
    // Read as text
    reader.readAsText(file);
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
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

/**
 * Hide error message
 */
function hideError() {
    errorMessage.style.display = 'none';
    errorText.textContent = '';
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
console.log('HTML Viewer initialized');
