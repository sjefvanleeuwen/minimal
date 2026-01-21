export interface StatProperty {
    label: string;
    value: string | number;
    color?: string;
}

export class StatsWindow {
    private container: HTMLDivElement;
    private titleElement: HTMLDivElement;
    private statsContainer: HTMLDivElement;

    constructor(title: string) {
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '20px';
        this.container.style.right = '20px';
        this.container.style.width = '200px';
        this.container.style.backgroundColor = 'rgba(13, 17, 23, 0.85)';
        this.container.style.border = '1px solid #30363d';
        this.container.style.borderRadius = '8px';
        this.container.style.padding = '12px';
        this.container.style.color = '#c9d1d9';
        this.container.style.fontFamily = 'monospace';
        this.container.style.fontSize = '12px';
        this.container.style.zIndex = '100';
        this.container.style.pointerEvents = 'none';
        this.container.style.backdropFilter = 'blur(4px)';

        this.titleElement = document.createElement('div');
        this.titleElement.style.fontWeight = 'bold';
        this.titleElement.style.marginBottom = '8px';
        this.titleElement.style.color = '#58a6ff';
        this.titleElement.style.borderBottom = '1px solid #30363d';
        this.titleElement.style.paddingBottom = '4px';
        this.titleElement.innerText = title;

        this.statsContainer = document.createElement('div');

        this.container.appendChild(this.titleElement);
        this.container.appendChild(this.statsContainer);
    }

    mount(parent: HTMLElement) {
        // Ensure the parent has relative positioning for the absolute stats window
        if (parent.style.position !== 'relative') {
            parent.style.position = 'relative';
        }
        parent.appendChild(this.container);
    }

    update(stats: StatProperty[]) {
        this.statsContainer.innerHTML = '';
        stats.forEach(stat => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.marginBottom = '2px';

            const labelCol = document.createElement('span');
            labelCol.innerText = stat.label + ':';
            labelCol.style.color = '#8b949e';

            const valueCol = document.createElement('span');
            valueCol.innerText = stat.value.toString();
            if (stat.color) valueCol.style.color = stat.color;

            row.appendChild(labelCol);
            row.appendChild(valueCol);
            this.statsContainer.appendChild(row);
        });
    }
}
