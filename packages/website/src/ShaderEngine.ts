export class ShaderEngine {
    static process(template: string, params: Record<string, string | number>): string {
        let shader = template;
        for (const [key, value] of Object.entries(params)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            shader = shader.replace(regex, value.toString());
        }
        return shader;
    }
}
