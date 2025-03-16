// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
    // Initialize the markdown editor
    const easyMDE = new EasyMDE({
        element: document.getElementById('notes-area'),
        spellChecker: false,
        status: false,
        autoDownloadFontAwesome: false, // We're using our own icons
        placeholder: "Take notes about this video here...",
        toolbar: [
            "bold", "italic", "heading", "|",
            "quote", "unordered-list", "ordered-list", "|",
            "link", "image", "|",
            "preview", "side-by-side", "fullscreen", "|",
            {
                name: "timestamp",
                action: function (editor) {
                    insertTimestamp(editor);
                },
                className: "fa fa-clock-o",
                title: "Insert timestamp"
            },
            {
                name: "snapshot",
                action: function (editor) {
                    insertSnapshot(editor);
                },
                className: "fa fa-camera",
                title: "Insert snapshot"
            }
        ],
        theme: "dark" // Use dark theme to match your YouTube enhancer
    });

    // Function to insert timestamp
    function insertTimestamp(editor) {
        // In a real implementation, get the current video time
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const cm = editor.codemirror;
        const stat = editor.getState(cm);
        const selectionStart = cm.getCursor("start");

        // Insert timestamp at cursor position
        cm.replaceSelection(`[${timestamp}] `);
        cm.setCursor(selectionStart.line, selectionStart.ch + timestamp.length + 3);
        cm.focus();
    }

    // Function to insert snapshot placeholder
    function insertSnapshot(editor) {
        // In a real implementation, this would capture a screenshot from the video
        const cm = editor.codemirror;
        const stat = editor.getState(cm);

        // Insert snapshot placeholder at cursor position
        cm.replaceSelection("![Snapshot](snapshot_placeholder.jpg)\n");
        cm.focus();
    }

    // Handle save button click
    document.getElementById('save-notes-button').addEventListener('click', function () {
        // Get the markdown content from the editor
        const content = easyMDE.value();

        // Save to localStorage
        localStorage.setItem('videoNotes', content);

        // Show success message
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = 'Notes saved successfully!';
        document.body.appendChild(toast);

        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    });

    // Handle export button click
    document.getElementById('export-notes-button').addEventListener('click', function () {
        const content = easyMDE.value();
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        // Set the filename to include video ID or title if available
        let videoTitle = 'video_notes';
        try {
            // Try to get the video title from YouTube if available
            const ytTitle = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer');
            if (ytTitle) {
                videoTitle = ytTitle.textContent.trim().replace(/[^\w\s]/gi, '_').substring(0, 30);
            }
        } catch (e) {
            // Fallback to default name
        }

        a.href = url;
        a.download = `${videoTitle}.md`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });

    // Handle import button click
    document.getElementById('import-notes-button').addEventListener('click', function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.txt';

        input.onchange = function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                // Set the content to the editor
                easyMDE.value(e.target.result);
            };
            reader.readAsText(file);
        };

        input.click();
    });

    // Load saved notes from localStorage if available
    const savedNotes = localStorage.getItem('videoNotes');
    if (savedNotes) {
        easyMDE.value(savedNotes);
    }

    // Add tab navigation functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to current button
            this.classList.add('active');

            // Show the corresponding tab content
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
});
