import { z } from 'zod';

// Common reusable schemas
export const walletAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address');

export const ethereumTxHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'URL must use HTTP or HTTPS protocol',
  });

// Agent schemas
export const agentCategorySchema = z.enum(['ai', 'data', 'content', 'tools', 'other']);
export const agentStatusSchema = z.enum(['draft', 'pending', 'live', 'paused', 'rejected']);

export const createAgentSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .trim(),
  description: z
    .string()
    .max(1000, 'Description must be at most 1000 characters')
    .trim()
    .optional()
    .nullable(),
  category: agentCategorySchema.optional().default('other'),
  endpointUrl: urlSchema,
  pricePerCall: z
    .number()
    .positive('Price must be positive')
    .max(10000, 'Price cannot exceed $10,000'),
});

export const updateAgentSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, 'Description must be at most 1000 characters')
    .trim()
    .optional()
    .nullable(),
  category: agentCategorySchema.optional(),
  endpointUrl: urlSchema.optional(),
  pricePerCall: z
    .number()
    .positive('Price must be positive')
    .max(10000, 'Price cannot exceed $10,000')
    .optional(),
  readme: z.string().max(50000, 'README must be at most 50,000 characters').optional().nullable(),
  tags: z.array(z.string().max(50)).max(10, 'Maximum 10 tags allowed').optional().nullable(),
  inputSchema: z.record(z.unknown()).optional().nullable(),
  outputSchema: z.record(z.unknown()).optional().nullable(),
});

// Publish confirmation schema
export const publishConfirmSchema = z.object({
  txHash: ethereumTxHashSchema,
  chainId: z.number().int().positive(),
  tokenId: z.string().min(1, 'Token ID is required'),
});

// Enable reviews schema
export const enableReviewsSchema = z.object({
  txHash: ethereumTxHashSchema,
  chainId: z.number().int().positive(),
});

// Auth schemas
export const verifySignatureSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format'),
});

export const updateProfileSchema = z.object({
  handle: z
    .string()
    .min(3, 'Handle must be at least 3 characters')
    .max(30, 'Handle must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Handle can only contain letters, numbers, and underscores')
    .optional()
    .nullable(),
  name: z.string().max(100, 'Name must be at most 100 characters').trim().optional().nullable(),
  email: z.string().email('Invalid email address').optional().nullable(),
  bio: z.string().max(500, 'Bio must be at most 500 characters').trim().optional().nullable(),
});

// Test endpoint schema
export const testEndpointSchema = z.object({
  url: urlSchema,
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().default('POST'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

// Helper to validate and return typed result
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorMessage = result.error.errors.map((e) => e.message).join(', ');
  return { success: false, error: errorMessage };
}

// Type exports
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type PublishConfirmInput = z.infer<typeof publishConfirmSchema>;
export type EnableReviewsInput = z.infer<typeof enableReviewsSchema>;
export type VerifySignatureInput = z.infer<typeof verifySignatureSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type TestEndpointInput = z.infer<typeof testEndpointSchema>;
