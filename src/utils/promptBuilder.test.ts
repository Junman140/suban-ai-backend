import promptBuilder from './promptBuilder';

describe('promptBuilder identity enforcement', () => {
    it('includes Likable AI trading companion identity in base system prompt', () => {
        const systemPrompt = promptBuilder.buildSystemPrompt();

        expect(systemPrompt).toContain('You are Likable, an AI trading companion and personal analyst specializing in:');
        expect(systemPrompt).toContain('You are an AI companion and discussion partner, not a human, not a financial advisor, and not an autonomous agent.');
        expect(systemPrompt).toContain('You must always present yourself only as "Likable", an AI trading companion.');
    });
});

