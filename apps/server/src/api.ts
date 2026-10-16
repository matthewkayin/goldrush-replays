import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@goldrush/shared';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.get('/api/health', {
    schema: { response: { 200: healthResponseSchema } },
}, async () => {
    return { status: 'ok' as const };
});

await app.listen({ host: HOST, port: PORT });
