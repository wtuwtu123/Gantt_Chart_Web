// Global variables
var tasks = [];
var zoomLevel = 1;
var taskNameColumnWidth = 200;
var isResizing = false;
var lastDownX = 0;
var filteredTasks = [];
var allResources = [];
var resourceFilter = 'All';
var originalHeaders = [];

// Get references to DOM elements
var container = document.getElementById('container');
var taskNamesContainer = document.getElementById('taskNamesContainer');
var ganttChartContainer = document.getElementById('ganttChartContainer');
var separator = document.getElementById('separator');

// File input handling
document.getElementById('csvFileInput').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) {
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        var contents = e.target.result;
        parseCSV(contents);
    };
    reader.readAsText(file);
});

// Resizing functionality
separator.addEventListener('mousedown', function(e) {
    isResizing = true;
    lastDownX = e.clientX;
    e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;

    var deltaX = e.clientX - lastDownX;
    lastDownX = e.clientX;

    var newTaskNameWidth = taskNameColumnWidth + deltaX;

    if (newTaskNameWidth < 100) newTaskNameWidth = 100; // Minimum width
    if (newTaskNameWidth > 500) newTaskNameWidth = 500; // Maximum width

    taskNameColumnWidth = newTaskNameWidth;

    taskNamesContainer.style.width = taskNameColumnWidth + 'px';

    renderGanttChart();
});

document.addEventListener('mouseup', function(e) {
    isResizing = false;
});

// CSV parsing functions
function parseCSV(contents) {
    var lines = contents.trim().split('\n');
    var delimiter = contents.indexOf('\t') !== -1 ? '\t' : ',';
    var headers = parseCSVLine(lines[0], delimiter);

    originalHeaders = headers.slice();

    headers = headers.map(function(header) {
        return header.trim().replace(/\s+/g, '');
    });

    tasks = [];

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line === '') continue;

        var values = parseCSVLine(line, delimiter);

        if (values.length > headers.length) {
            values[headers.length - 1] = values.slice(headers.length - 1).join(delimiter);
            values = values.slice(0, headers.length);
        } else {
            while (values.length < headers.length) {
                values.push('');
            }
        }

        values = values.map(function(v) {
            return v.replace(/^"|"$/g, '').trim();
        });

        var task = {};
        for (var j = 0; j < headers.length; j++) {
            var header = headers[j];
            var value = values[j];
            task[header] = value;
        }

        // Ensure IDs are strings
        task.ID = task.ID.toString();

        tasks.push(task);
    }

    buildTaskHierarchy();
    populateResourceFilter();
    renderGanttChart();
}

function parseCSVLine(line, delimiter) {
    var values = [];
    var current = '';
    var insideQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var char = line[i];
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === delimiter && !insideQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    return values;
}

// Populate resource filter dropdown
function populateResourceFilter() {
    var resourceSet = new Set();
    tasks.forEach(function(task) {
        if (task.ResourceNames && task.ResourceNames.trim() !== '') {
            resourceSet.add(task.ResourceNames.trim());
        }
    });

    allResources = Array.from(resourceSet).sort();
    allResources.unshift('All');

    var resourceFilterSelect = document.getElementById('resourceFilter');
    resourceFilterSelect.innerHTML = '';

    allResources.forEach(function(resource) {
        var option = document.createElement('option');
        option.value = resource;
        option.textContent = resource;
        resourceFilterSelect.appendChild(option);
    });

    resourceFilterSelect.value = resourceFilter;
    resourceFilterSelect.addEventListener('change', function() {
        resourceFilter = this.value;
        renderGanttChart();
    });
}

// Modified buildTaskHierarchy function
function buildTaskHierarchy() {
    tasks.forEach(function(task) {
        task.children = [];
        task.collapsed = false; // By default, tasks are expanded
        task.parent = null; // Reset parent

        // Ensure IDs are strings
        task.ID = task.ID.toString();

        // Parse OutlineLevel as integer
        task.OutlineLevel = parseInt(task.OutlineLevel) || 1;
    });

    var lastTasksAtLevel = {}; // Keep track of the last task at each level

    tasks.forEach(function(task) {
        var outlineLevel = task.OutlineLevel;

        // If the task is at level 1, it has no parent
        if (outlineLevel === 1) {
            task.parent = null;
        } else {
            // For levels greater than 1, the parent is the last task at level outlineLevel - 1
            var parentLevel = outlineLevel - 1;
            var parentTask = lastTasksAtLevel[parentLevel];
            if (parentTask) {
                task.parent = parentTask;
                parentTask.children.push(task);
            } else {
                // If no parent found, set parent to null
                task.parent = null;
            }
        }

        // Update the last task at this level
        lastTasksAtLevel[outlineLevel] = task;
    });
}

// Filter tasks based on resource
function filterTasks() {
    tasks.forEach(function(task) {
        task.visible = false;
    });

    var includedTaskIDs = new Set();

    if (resourceFilter === 'All') {
        includedTaskIDs = new Set(tasks.map(task => task.ID));
    } else {
        var tasksWithResource = tasks.filter(function(task) {
            return task.ResourceNames && task.ResourceNames.trim() === resourceFilter;
        });

        tasksWithResource.forEach(function(task) {
            includeTaskAndAncestors(task, includedTaskIDs);
        });
    }

    // Build filteredTasks by including tasks in the original order
    filteredTasks = tasks.filter(function(task) {
        return includedTaskIDs.has(task.ID);
    });
}

function includeTaskAndAncestors(task, includedTaskIDs) {
    if (!includedTaskIDs.has(task.ID)) {
        includedTaskIDs.add(task.ID);

        // Include parent tasks to maintain hierarchy
        if (task.parent) {
            includeTaskAndAncestors(task.parent, includedTaskIDs);
        }
    }
}

// Update task visibility based on collapsed state
function updateTaskVisibility() {
    function setVisibility(task, parentVisible) {
        task.visible = parentVisible;

        if (task.collapsed || !task.visible) {
            hideChildren(task);
        } else {
            task.children.forEach(function(child) {
                setVisibility(child, true);
            });
        }
    }

    function hideChildren(task) {
        task.children.forEach(function(child) {
            child.visible = false;
            hideChildren(child);
        });
    }

    filteredTasks.forEach(function(task) {
        if (!task.parent) {
            setVisibility(task, true);
        }
    });
}

// Render the Gantt chart
function renderGanttChart() {
    var scrollLeft = ganttChartContainer.scrollLeft;
    var scrollTop = ganttChartContainer.scrollTop;
    var taskNamesScrollTop = taskNamesContainer.scrollTop;

    ganttChartContainer.innerHTML = '';
    taskNamesContainer.innerHTML = '';

    filterTasks();
    updateTaskVisibility();

    var minDate = null;
    var maxDate = null;

    var visibleTasks = filteredTasks.filter(function(task) {
        return task.visible;
    });

    visibleTasks.forEach(function(task) {
        var startDate = new Date(task.Start);
        var finishDate = new Date(task.Finish);

        if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime())) {
            return;
        }

        if (!minDate || startDate < minDate) {
            minDate = startDate;
        }
        if (!maxDate || finishDate > maxDate) {
            maxDate = finishDate;
        }
    });

    if (!minDate || !maxDate) {
        return;
    }

    var bufferDuration = 7 * 24 * 60 * 60 * 1000;
    minDate = new Date(minDate.getTime() - bufferDuration);
    maxDate = new Date(maxDate.getTime() + bufferDuration);

    var chartWidth = ganttChartContainer.offsetWidth * zoomLevel;
    var taskRowHeight = 30;
    var headerHeight = 30;

    var totalHeight = visibleTasks.length * taskRowHeight + headerHeight;

    var svgNS = 'http://www.w3.org/2000/svg';

    // Render task names
    var taskNamesSVG = document.createElementNS(svgNS, 'svg');
    taskNamesSVG.setAttribute('height', totalHeight);
    taskNamesSVG.setAttribute('width', taskNameColumnWidth);
    taskNamesContainer.appendChild(taskNamesSVG);

    var taskNameHeaderRect = document.createElementNS(svgNS, 'rect');
    taskNameHeaderRect.setAttribute('x', 0);
    taskNameHeaderRect.setAttribute('y', 0);
    taskNameHeaderRect.setAttribute('width', taskNameColumnWidth);
    taskNameHeaderRect.setAttribute('height', headerHeight);
    taskNameHeaderRect.setAttribute('class', 'header');
    taskNamesSVG.appendChild(taskNameHeaderRect);

    var taskNameHeaderText = document.createElementNS(svgNS, 'text');
    taskNameHeaderText.setAttribute('x', 5);
    taskNameHeaderText.setAttribute('y', headerHeight / 2 + 5);
    taskNameHeaderText.setAttribute('class', 'header-text');
    taskNameHeaderText.textContent = 'Task Name';
    taskNamesSVG.appendChild(taskNameHeaderText);

    // Render chart
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('height', totalHeight);
    svg.setAttribute('width', chartWidth);
    ganttChartContainer.appendChild(svg);

    var defs = document.createElementNS(svgNS, 'defs');
    svg.appendChild(defs);

    var marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '0');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');

    var markerPath = document.createElementNS(svgNS, 'path');
    markerPath.setAttribute('d', 'M0,0 L0,7 L10,3.5 z');
    markerPath.setAttribute('fill', '#555');
    marker.appendChild(markerPath);
    defs.appendChild(marker);

    drawXAxis(svg, minDate, maxDate, chartWidth, headerHeight, totalHeight);

    var taskMap = {};
    var validTaskIndex = 0;

    var currentDate = new Date(); // Get the current date

    visibleTasks.forEach(function(task) {
        var startDate = new Date(task.Start);
        var finishDate = new Date(task.Finish);

        if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime())) {
            return;
        }

        var taskStartOffset = ((startDate - minDate) / (maxDate - minDate)) * chartWidth;
        var taskDuration = ((finishDate - startDate) / (maxDate - minDate)) * chartWidth;

        var yPosition = headerHeight + validTaskIndex * taskRowHeight;

        // Ensure IDs are strings
        var taskID = task.ID.toString();

        taskMap[taskID] = {
            x: taskStartOffset,
            y: yPosition,
            width: taskDuration,
            height: taskRowHeight - 10,
            index: validTaskIndex
        };

        // Task name background
        var taskNameBg = document.createElementNS(svgNS, 'rect');
        taskNameBg.setAttribute('x', 0);
        taskNameBg.setAttribute('y', yPosition);
        taskNameBg.setAttribute('width', taskNameColumnWidth);
        taskNameBg.setAttribute('height', taskRowHeight);
        taskNameBg.setAttribute('fill', '#fff');
        taskNameBg.setAttribute('stroke', '#e0e0e0');
        taskNamesSVG.appendChild(taskNameBg);

        // Collapse/expand indicator
        var hasChildren = task.children && task.children.length > 0;
        if (hasChildren) {
            var indicator = document.createElementNS(svgNS, 'text');
            indicator.setAttribute('x', 5 + ((task.OutlineLevel - 1) * 15));
            indicator.setAttribute('y', yPosition + taskRowHeight / 2 + 4);
            indicator.setAttribute('class', 'collapsed-indicator');
            indicator.textContent = task.collapsed ? '+' : '-';
            indicator.addEventListener('click', function(e) {
                e.stopPropagation();
                task.collapsed = !task.collapsed;
                renderGanttChart();
            });
            taskNamesSVG.appendChild(indicator);
        }

        // Task name text
        var taskNameText = document.createElementNS(svgNS, 'text');
        var textX = hasChildren
            ? 20 + ((task.OutlineLevel - 1) * 15)
            : 5 + ((task.OutlineLevel - 1) * 15);
        taskNameText.setAttribute('x', textX);
        taskNameText.setAttribute('y', yPosition + taskRowHeight / 2 + 4);
        taskNameText.setAttribute('class', 'task-name');
        taskNameText.textContent = task.Name || 'No Name';

        taskNameText.addEventListener('click', function() {
            if (hasChildren) {
                task.collapsed = !task.collapsed;
                renderGanttChart();
            }
        });

        var title = document.createElementNS(svgNS, 'title');
        title.textContent = task.Name || 'No Name';
        taskNameText.appendChild(title);

        taskNamesSVG.appendChild(taskNameText);

        // Determine task color based on completion and overdue status
        var percentComplete = parseFloat(task['%Complete']) || 0;
        var taskColor;

        if (percentComplete === 100) {
            taskColor = '#27ae60'; // Green for completed tasks
        } else if (finishDate < currentDate && percentComplete < 100) {
            taskColor = '#e74c3c'; // Red for overdue and incomplete tasks
        } else {
            // Default colors based on OutlineLevel
            var outlineLevel = task.OutlineLevel || 1;
            if (outlineLevel === 1) {
                taskColor = '#7f8c8d';
            } else if (outlineLevel === 2) {
                taskColor = '#3498db';
            } else if (outlineLevel >= 3) {
                taskColor = '#85c1e9';
            } else {
                taskColor = '#3498db'; // Default color
            }
        }

        // Task bar
        var rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', taskStartOffset);
        rect.setAttribute('y', yPosition + 5);
        rect.setAttribute('width', taskDuration);
        rect.setAttribute('height', taskRowHeight - 10);
        rect.setAttribute('fill', taskColor);
        rect.setAttribute('class', 'task-bar');
        rect.setAttribute('data-index', task.index);

        rect.addEventListener('mouseover', function(e) {
            showTooltip(e, task);
        });
        rect.addEventListener('mouseout', function(e) {
            hideTooltip();
        });

        rect.addEventListener('click', function(e) {
            showEditTaskPopup(task);
        });

        svg.appendChild(rect);

        validTaskIndex++;
    });

    drawDependencies(svg, filteredTasks, taskMap);

    ganttChartContainer.scrollLeft = scrollLeft;
    ganttChartContainer.scrollTop = scrollTop;
    taskNamesContainer.scrollTop = taskNamesScrollTop;

    // Synchronize scrolling between task names and chart
    taskNamesContainer.addEventListener('scroll', function() {
        ganttChartContainer.scrollTop = taskNamesContainer.scrollTop;
    });
    ganttChartContainer.addEventListener('scroll', function() {
        taskNamesContainer.scrollTop = ganttChartContainer.scrollTop;
    });

    document.getElementById('zoomInButton').onclick = function() {
        zoomLevel *= 1.5;
        renderGanttChart();
    };

    document.getElementById('zoomOutButton').onclick = function() {
        zoomLevel /= 1.5;
        renderGanttChart();
    };
}

// Draw X-axis and grid lines
function drawXAxis(svg, minDate, maxDate, chartWidth, headerHeight, totalHeight) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var timeSpan = maxDate - minDate;
    var pixelsPerDay = chartWidth / (timeSpan / (1000 * 3600 * 24));

    var labelInterval;
    var dateFormatOptions;

    if (pixelsPerDay * zoomLevel > 80) {
        labelInterval = 1000 * 3600 * 24;
        dateFormatOptions = { day: 'numeric', month: 'short' };
    } else if (pixelsPerDay * zoomLevel > 20) {
        labelInterval = 1000 * 3600 * 24 * 7;
        dateFormatOptions = { day: 'numeric', month: 'short' };
    } else {
        labelInterval = 1000 * 3600 * 24 * 30;
        dateFormatOptions = { month: 'short', year: 'numeric' };
    }

    for (var time = minDate.getTime(); time <= maxDate.getTime(); time += labelInterval) {
        var xPos = ((time - minDate.getTime()) / (maxDate - minDate)) * chartWidth;

        var line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', xPos);
        line.setAttribute('y1', headerHeight);
        line.setAttribute('x2', xPos);
        line.setAttribute('y2', totalHeight);
        line.setAttribute('class', 'axis-line');
        svg.appendChild(line);

        if (xPos > 30) {
            var label = document.createElementNS(svgNS, 'text');
            label.setAttribute('x', xPos);
            label.setAttribute('y', headerHeight / 2 + 5);
            label.setAttribute('class', 'axis-label');
            label.textContent = new Date(time).toLocaleDateString('en-US', dateFormatOptions);
            svg.appendChild(label);
        }
    }
}

// Draw dependency lines
function drawDependencies(svg, tasksList, taskMap) {
    var svgNS = 'http://www.w3.org/2000/svg';

    tasksList.forEach(function(task) {
        if (!task.Predecessors || !taskMap[task.ID.toString()] || !task.visible) {
            return;
        }

        var predecessors = task.Predecessors.split(',');

        predecessors.forEach(function(predecessorStr) {
            var match = predecessorStr.trim().match(/^(\d+)(FS|SS|FF|SF)?/i);
            if (!match) return;

            var predecessorID = match[1].toString();
            var dependencyType = match[2] || 'FS';

            var predecessorTask = taskMap[predecessorID];
            var successorTask = taskMap[task.ID.toString()];

            if (!predecessorTask || !successorTask) return;

            var predecessorTaskObj = tasks.find(function(t) { return t.ID.toString() === predecessorID; });
            if (!predecessorTaskObj || !predecessorTaskObj.visible) return;

            var startX, startY, endX, endY;
            var gap = 5;

            if (dependencyType.toUpperCase() === 'FS') {
                startX = predecessorTask.x + predecessorTask.width;
                startY = predecessorTask.y + predecessorTask.height / 2 + 5;
                endX = successorTask.x;
                endY = successorTask.y + successorTask.height / 2 + 5;
            } else if (dependencyType.toUpperCase() === 'SS') {
                startX = predecessorTask.x;
                startY = predecessorTask.y + predecessorTask.height / 2 + 5;
                endX = successorTask.x;
                endY = successorTask.y + successorTask.height / 2 + 5;
            } else if (dependencyType.toUpperCase() === 'FF') {
                startX = predecessorTask.x + predecessorTask.width;
                startY = predecessorTask.y + predecessorTask.height / 2 + 5;
                endX = successorTask.x + successorTask.width;
                endY = successorTask.y + successorTask.height / 2 + 5;
            } else if (dependencyType.toUpperCase() === 'SF') {
                startX = predecessorTask.x;
                startY = predecessorTask.y + predecessorTask.height / 2 + 5;
                endX = successorTask.x + successorTask.width;
                endY = successorTask.y + successorTask.height / 2 + 5;
            } else {
                return;
            }

            var path = document.createElementNS(svgNS, 'path');
            path.setAttribute('class', 'dependency-line');

            // Set the marker-end attribute directly on the path
            path.setAttribute('marker-end', 'url(#arrowhead)');

            var d = [
                'M', startX, startY,
                'L', startX + gap, startY,
                'L', startX + gap, endY,
                'L', endX - gap, endY,
                'L', endX, endY
            ].join(' ');

            path.setAttribute('d', d);

            svg.appendChild(path);
        });
    });
}

// Tooltip functions
var tooltip = document.getElementById('tooltip');

function showTooltip(e, task) {
    var taskName = task.Name || 'No Name';
    var resource = task.ResourceNames || 'No Resource';
    var notes = task.Notes || '';
    var percentComplete = task['%Complete'] || '0';
    var startDate = task.Start ? new Date(task.Start) : null;
    var finishDate = task.Finish ? new Date(task.Finish) : null;

    notes = stripHTMLTags(notes);

    var content = '';
    content += '<strong>Task:</strong> ' + taskName + '<br><br>';
    if (resource) {
        content += '<strong>Resource:</strong> ' + resource + '<br><br>';
    }
    if (startDate && finishDate && !isNaN(startDate) && !isNaN(finishDate)) {
        var startStr = formatDate(startDate);
        var finishStr = formatDate(finishDate);
        content += '<strong>Task Date:</strong> ' + startStr + ' - ' + finishStr + '<br><br>';
    }
    if (notes) {
        content += '<strong>Notes:</strong><br>' + notes + '<br><br>';
    }
    content += '<strong>Progress:</strong> ' + percentComplete + '%';

    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

function stripHTMLTags(html) {
    html = html.replace(/<br\s*\/?>/gi, '\n');
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var text = tmp.textContent || tmp.innerText || '';
    return text.trim();
}

function formatDate(date) {
    var day = ('0' + date.getDate()).slice(-2);
    var month = ('0' + (date.getMonth() + 1)).slice(-2);
    var year = date.getFullYear();
    return day + '/' + month + '/' + year;
}

// Format date for input[type="date"]
function formatDateInput(dateStr) {
    var date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    var year = date.getFullYear();
    var month = ('0' + (date.getMonth() + 1)).slice(-2);
    var day = ('0' + date.getDate()).slice(-2);
    return year + '-' + month + '-' + day;
}

// Show Edit Task Popup
function showEditTaskPopup(task) {
    var popup = document.getElementById('editTaskPopup');
    popup.innerHTML = ''; // Clear previous content

    var form = document.createElement('form');

    // Create input fields for the parameters
    var fields = [
        { label: 'Outline Level', name: 'OutlineLevel', type: 'number', value: task.OutlineLevel },
        { label: 'ID', name: 'ID', type: 'text', value: task.ID },
        { label: 'Name', name: 'Name', type: 'text', value: task.Name },
        { label: 'Start', name: 'Start', type: 'date', value: formatDateInput(task.Start) },
        { label: 'Finish', name: 'Finish', type: 'date', value: formatDateInput(task.Finish) },
        { label: '% Complete', name: '%Complete', type: 'number', value: task['%Complete'] },
        { label: 'Predecessor', name: 'Predecessors', type: 'text', value: task.Predecessors },
        { label: 'Resource', name: 'ResourceNames', type: 'text', value: task.ResourceNames },
        { label: 'Notes', name: 'Notes', type: 'textarea', value: task.Notes }
    ];

    fields.forEach(function(field) {
        var label = document.createElement('label');
        label.textContent = field.label;
        form.appendChild(label);

        var input;
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 4;
        } else {
            input = document.createElement('input');
            input.type = field.type;
        }
        input.name = field.name;
        input.value = field.value || '';
        form.appendChild(input);
    });

    var buttonContainer = document.createElement('div');
    buttonContainer.style.textAlign = 'right';

    var applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    applyButton.type = 'button';
    applyButton.addEventListener('click', function() {
        // Update the task with the new values
        var formData = new FormData(form);
        fields.forEach(function(field) {
            var value = formData.get(field.name);
            if (field.name === 'OutlineLevel') {
                task[field.name] = parseInt(value);
            } else if (field.name === '%Complete') {
                task[field.name] = parseFloat(value);
            } else if (field.name === 'Start' || field.name === 'Finish') {
                task[field.name] = value;
            } else {
                task[field.name] = value;
            }
        });
        // Rebuild task hierarchy and re-render the chart
        buildTaskHierarchy();
        renderGanttChart();
        // Hide the popup
        popup.style.display = 'none';
    });
    buttonContainer.appendChild(applyButton);

    var cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', function() {
        popup.style.display = 'none';
    });
    buttonContainer.appendChild(cancelButton);

    form.appendChild(buttonContainer);

    popup.appendChild(form);
    popup.style.display = 'block';
}

// Export functionality
document.getElementById('exportButton').addEventListener('click', function() {
    exportCSV();
});

function exportCSV() {
    var csvContent = '';
    var delimiter = ',';

    csvContent += originalHeaders.join(delimiter) + '\n';

    tasks.forEach(function(task) {
        var row = [];
        originalHeaders.forEach(function(header) {
            var value = task[header.trim().replace(/\s+/g, '')] || '';
            if (value.indexOf(delimiter) >= 0 || value.indexOf('\n') >= 0 || value.indexOf('"') >= 0) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            row.push(value);
        });
        csvContent += row.join(delimiter) + '\n';
    });

    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'exported_tasks.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Collapse All and Expand All buttons
document.getElementById('collapseAllButton').onclick = function() {
    tasks.forEach(function(task) {
        if (task.children && task.children.length > 0) {
            task.collapsed = true;
        }
    });
    renderGanttChart();
};

document.getElementById('expandAllButton').onclick = function() {
    tasks.forEach(function(task) {
        if (task.children && task.children.length > 0) {
            task.collapsed = false;
        }
    });
    renderGanttChart();
};
