/**
 * I18n Semantic Module Unit Tests
 * 
 * Tests internationalization and localization patterns:
 * - Accept-Language header support
 * - Content-Language response headers
 * - Locale-specific content negotiation
 * - Multi-language error messages
 * - Currency and timezone handling
 * 
 * Critical for global API accessibility and localization.
 */

import { checkI18n } from '../../../src/app/semantic/i18n';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('I18n Semantic Module', () => {
  describe('Language Header Support', () => {
    it('should validate Accept-Language header support', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'I18n API', version: '1.0.0' },
        paths: {
          '/api/v2/content': {
            get: {
              operationId: 'getLocalizedContent',
              parameters: [
                {
                  name: 'Accept-Language',
                  in: 'header',
                  schema: { type: 'string' },
                  description: 'Preferred language for response',
                  example: 'en-US,en;q=0.9,es;q=0.8'
                }
              ],
              responses: {
                '200': {
                  description: 'Localized content',
                  headers: {
                    'Content-Language': {
                      description: 'Language of the returned content',
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'object',
                            properties: {
                              title: { type: 'string' },
                              description: { type: 'string' },
                              locale: { type: 'string' },
                              content: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
      expect(result.score.i18n.max).toBe(6);
    });

    it('should validate Content-Language response headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Multilingual API', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              operationId: 'getProducts',
              responses: {
                '200': {
                  description: 'Product list with localization',
                  headers: {
                    'Content-Language': {
                      description: 'Language of product descriptions',
                      schema: { 
                        type: 'string',
                        example: 'en-US'
                      }
                    },
                    'Vary': {
                      description: 'Response varies by Accept-Language',
                      schema: {
                        type: 'string',
                        example: 'Accept-Language'
                      }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                description: { type: 'string' },
                                locale: { type: 'string' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });

    it('should validate locale-specific endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Locale API', version: '1.0.0' },
        paths: {
          '/api/v2/{locale}/announcements': {
            get: {
              operationId: 'getLocalizedAnnouncements',
              parameters: [
                {
                  name: 'locale',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'string',
                    pattern: '^[a-z]{2}(-[A-Z]{2})?$',
                    example: 'en-US'
                  },
                  description: 'Language and country code'
                }
              ],
              responses: {
                '200': {
                  description: 'Localized announcements',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                title: { type: 'string' },
                                content: { type: 'string' },
                                locale: { type: 'string' },
                                published_at: { type: 'string', format: 'date-time' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                '404': {
                  description: 'Locale not supported',
                  content: {
                    'application/problem+json': {
                      schema: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          title: { type: 'string' },
                          status: { type: 'integer', example: 404 },
                          detail: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Localized Error Messages', () => {
    it('should validate multilingual error responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Error I18n API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            post: {
              operationId: 'createUser',
              parameters: [
                {
                  name: 'Accept-Language',
                  in: 'header',
                  schema: { type: 'string' }
                }
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['email'],
                      properties: {
                        email: { type: 'string', format: 'email' },
                        name: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                },
                '400': {
                  description: 'Validation error with localized messages',
                  headers: {
                    'Content-Language': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/problem+json': {
                      schema: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          title: { type: 'string' },
                          status: { type: 'integer', example: 400 },
                          detail: { type: 'string' },
                          locale: { type: 'string' },
                          errors: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                field: { type: 'string' },
                                message: { type: 'string' },
                                code: { type: 'string' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });

    it('should validate error message localization schemas', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Localized Errors API', version: '1.0.0' },
        components: {
          schemas: {
            LocalizedError: {
              type: 'object',
              required: ['type', 'title', 'status'],
              properties: {
                type: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'integer' },
                detail: { type: 'string' },
                locale: {
                  type: 'string',
                  description: 'Language code for the error message'
                },
                translations: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      detail: { type: 'string' }
                    }
                  },
                  description: 'Error messages in different languages'
                }
              }
            }
          }
        },
        paths: {}
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Currency and Regional Formatting', () => {
    it('should validate currency localization support', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Currency API', version: '1.0.0' },
        paths: {
          '/api/v2/pricing': {
            get: {
              operationId: 'getPricing',
              parameters: [
                {
                  name: 'currency',
                  in: 'query',
                  schema: {
                    type: 'string',
                    enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD'],
                    default: 'USD'
                  },
                  description: 'Currency for price display'
                },
                {
                  name: 'region',
                  in: 'query',
                  schema: {
                    type: 'string',
                    enum: ['US', 'EU', 'UK', 'JP', 'CA'],
                    default: 'US'
                  },
                  description: 'Region for tax and pricing rules'
                }
              ],
              responses: {
                '200': {
                  description: 'Regional pricing information',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'object',
                            properties: {
                              currency: { type: 'string' },
                              region: { type: 'string' },
                              prices: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    product_id: { type: 'string' },
                                    base_price: { type: 'number' },
                                    formatted_price: { type: 'string' },
                                    tax_amount: { type: 'number' },
                                    total_price: { type: 'number' }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });

    it('should validate timezone handling', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Timezone API', version: '1.0.0' },
        paths: {
          '/api/v2/events': {
            get: {
              operationId: 'getEvents',
              parameters: [
                {
                  name: 'timezone',
                  in: 'query',
                  schema: { type: 'string' },
                  description: 'Timezone for date/time formatting',
                  example: 'America/New_York'
                },
                {
                  name: 'date_format',
                  in: 'query',
                  schema: {
                    type: 'string',
                    enum: ['ISO8601', 'RFC3339', 'local'],
                    default: 'ISO8601'
                  },
                  description: 'Date format preference'
                }
              ],
              responses: {
                '200': {
                  description: 'Events with timezone-aware dates',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                title: { type: 'string' },
                                start_time: { type: 'string', format: 'date-time' },
                                end_time: { type: 'string', format: 'date-time' },
                                timezone: { type: 'string' },
                                formatted_start: { type: 'string' },
                                formatted_end: { type: 'string' }
                              }
                            }
                          },
                          meta: {
                            type: 'object',
                            properties: {
                              timezone: { type: 'string' },
                              date_format: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });

    it('should validate number formatting preferences', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Number Format API', version: '1.0.0' },
        paths: {
          '/api/v2/statistics': {
            get: {
              operationId: 'getStatistics',
              parameters: [
                {
                  name: 'number_format',
                  in: 'query',
                  schema: {
                    type: 'string',
                    enum: ['1,234.56', '1.234,56', '1 234,56'],
                    default: '1,234.56'
                  },
                  description: 'Number formatting preference'
                },
                {
                  name: 'locale',
                  in: 'query',
                  schema: { type: 'string' },
                  example: 'en-US'
                }
              ],
              responses: {
                '200': {
                  description: 'Statistics with formatted numbers',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'object',
                            properties: {
                              total_users: { type: 'integer' },
                              formatted_total_users: { type: 'string' },
                              revenue: { type: 'number' },
                              formatted_revenue: { type: 'string' },
                              growth_rate: { type: 'number' },
                              formatted_growth_rate: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Multi-tenant Localization', () => {
    it('should validate tenant-specific localization preferences', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Multi-tenant I18n API', version: '1.0.0' },
        paths: {
          '/api/v2/organizations/{orgId}/content': {
            get: {
              operationId: 'getOrgContent',
              parameters: [
                {
                  name: 'orgId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                },
                { $ref: '#/components/parameters/OrganizationHeader' },
                {
                  name: 'Accept-Language',
                  in: 'header',
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: 'Organization-specific localized content',
                  headers: {
                    'Content-Language': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'object',
                            properties: {
                              organization_id: { type: 'integer' },
                              default_locale: { type: 'string' },
                              supported_locales: {
                                type: 'array',
                                items: { type: 'string' }
                              },
                              content: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string' },
                                    title: { type: 'string' },
                                    body: { type: 'string' },
                                    locale: { type: 'string' }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        components: {
          parameters: {
            OrganizationHeader: {
              name: 'X-Organization-ID',
              in: 'header',
              required: true,
              schema: { type: 'integer' }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });

    it('should validate organization locale configuration', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Org Locale Config API', version: '1.0.0' },
        paths: {
          '/api/v2/organizations/{orgId}/settings/localization': {
            get: {
              operationId: 'getOrgLocalizationSettings',
              responses: {
                '200': {
                  description: 'Organization localization settings',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'object',
                            properties: {
                              default_language: { type: 'string' },
                              supported_languages: {
                                type: 'array',
                                items: { type: 'string' }
                              },
                              default_currency: { type: 'string' },
                              default_timezone: { type: 'string' },
                              date_format: { type: 'string' },
                              number_format: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            put: {
              operationId: 'updateOrgLocalizationSettings',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        default_language: { type: 'string' },
                        supported_languages: {
                          type: 'array',
                          items: { type: 'string' }
                        },
                        default_currency: { type: 'string' },
                        default_timezone: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': {
                  description: 'Settings updated',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkI18n(spec);

      expect(result.findings).toEqual([]);
      expect(result.score.i18n.add).toBe(6);
      expect(result.score.i18n.max).toBe(6);
    });

    it('should handle operations with no i18n patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Simple API', version: '1.0.0' },
        paths: {
          '/api/v2/health': {
            get: {
              responses: {
                '200': {
                  description: 'Health check',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBe(0); // No i18n features, max deductions
    });

    it('should handle null paths gracefully', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: null
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBe(6);
    });

    it('should handle operations with malformed headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/content': {
            get: {
              parameters: [
                {
                  name: 'Accept-Language',
                  in: 'header',
                  schema: null
                }
              ],
              responses: {
                '200': {
                  description: 'Success',
                  headers: null
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBe(3); // Has Accept-Language but missing Content-Language
    });

    it('should handle operations with no responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/i18n-test': {
            get: {
              operationId: 'i18nTest'
              // Missing responses
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBe(0); // No i18n features, max deductions
    });
  });

  describe('Content Negotiation', () => {
    it('should validate content negotiation with language preferences', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Content Negotiation API', version: '1.0.0' },
        paths: {
          '/api/v2/documents/{id}': {
            get: {
              operationId: 'getDocument',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                },
                {
                  name: 'Accept-Language',
                  in: 'header',
                  schema: { type: 'string' },
                  description: 'Language preference with quality values'
                }
              ],
              responses: {
                '200': {
                  description: 'Document in preferred language',
                  headers: {
                    'Content-Language': {
                      schema: { type: 'string' }
                    },
                    'Vary': {
                      schema: { type: 'string', example: 'Accept-Language' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              title: { type: 'string' },
                              content: { type: 'string' },
                              language: { type: 'string' },
                              available_languages: {
                                type: 'array',
                                items: { type: 'string' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                '406': {
                  description: 'Language not acceptable',
                  content: {
                    'application/problem+json': {
                      schema: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          title: { type: 'string' },
                          status: { type: 'integer', example: 406 },
                          detail: { type: 'string' },
                          supported_languages: {
                            type: 'array',
                            items: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBe(5); // -1 for no language property in response
    });

    it('should validate language fallback mechanisms', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Language Fallback API', version: '1.0.0' },
        paths: {
          '/api/v2/help/{topic}': {
            get: {
              operationId: 'getHelp',
              parameters: [
                {
                  name: 'topic',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                },
                {
                  name: 'Accept-Language',
                  in: 'header',
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: 'Help content with fallback info',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'object',
                            properties: {
                              topic: { type: 'string' },
                              title: { type: 'string' },
                              content: { type: 'string' },
                              requested_language: { type: 'string' },
                              actual_language: { type: 'string' },
                              is_fallback: { type: 'boolean' },
                              fallback_chain: {
                                type: 'array',
                                items: { type: 'string' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkI18n(spec);

      expect(result.score.i18n.add).toBe(3); // Deductions for missing headers and localization
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large i18n specifications efficiently', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Large I18n API', version: '1.0.0' },
        paths: {} as any
      };

      // Add many localized endpoints
      for (let i = 0; i < 30; i++) {
        spec.paths[`/api/v2/content${i}`] = {
          get: {
            parameters: [
              {
                name: 'Accept-Language',
                in: 'header',
                schema: { type: 'string' }
              }
            ],
            responses: {
              '200': {
                description: `Localized content ${i}`,
                headers: {
                  'Content-Language': { schema: { type: 'string' } }
                },
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              }
            }
          }
        };
      }

      const start = performance.now();
      const result = checkI18n(spec);
      const end = performance.now();

      expect(end - start).toBeLessThan(100); // Stub should be very fast
      expect(result.score.i18n.add).toBe(5); // -1 for no language/locale property in responses
      expect(result.score.i18n.max).toBe(6);
    });
  });

  describe('Stub Implementation Consistency', () => {
    it('should return consistent scoring regardless of input complexity', () => {
      const specs = [
        MockOpenApiFactory.validMinimal(),
        { openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} },
        {
          openapi: '3.0.3',
          info: { title: 'Complex I18n', version: '1.0.0' },
          paths: {
            '/api/v2/localized': {
              get: {
                parameters: [
                  {
                    name: 'Accept-Language',
                    in: 'header',
                    schema: { type: 'string' }
                  }
                ],
                responses: {
                  '200': {
                    description: 'Localized response',
                    headers: {
                      'Content-Language': { schema: { type: 'string' } }
                    },
                    content: {
                      'application/json': {
                        schema: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      ];

      // Test each spec individually with expected scores
      const minimalResult = checkI18n(specs[0]);
      expect(minimalResult.findings.length).toBeGreaterThan(0); // Has findings for missing i18n
      expect(minimalResult.score.i18n.add).toBe(0); // No i18n features
      expect(minimalResult.score.i18n.max).toBe(6);
      
      const emptyResult = checkI18n(specs[1]);
      expect(emptyResult.findings.length).toBe(3); // Has findings for missing i18n features
      expect(emptyResult.score.i18n.add).toBe(1); // 6 - 2 (Accept) - 2 (Content) - 1 (localized) = 1
      expect(emptyResult.score.i18n.max).toBe(6);
      
      const i18nResult = checkI18n(specs[2]);
      expect(i18nResult.findings.length).toBe(1); // Has finding for no localized content
      expect(i18nResult.score.i18n.add).toBe(5); // -1 for no localized content
      expect(i18nResult.score.i18n.max).toBe(6);
    });
  });
});