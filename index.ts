import { RequestHandler } from 'express';
import Joi from 'joi';
import { ProcessTypes } from '@packages/types';
import { generalResponse, joiCommon } from '@packages/core';
import { cleanObj } from '@packages/core/utils';

export const checkAuthSchema = Joi.object({
  email: joiCommon.joiEmail.required(),
  provider_name: joiCommon.joiString.required(),
}).options({
  abortEarly: false,
});

export const nextPrevMailSchema = Joi.object({
  label: Joi.array().required(),
}).options({
  abortEarly: false,
  allowUnknown: true,
});

export const emailSchema = Joi.alternatives().try(
  joiCommon.joiString.email({ ignoreLength: true }),
  Joi.object({
    name: joiCommon.joiString.required().label('Person Name'),
    address: joiCommon.joiEmail.required().label('Person Email'),
  }),
);

export const attachmentSchema = {
  path: joiCommon.joiString.required().label('File Path'),
  filename: joiCommon.joiString.required().label('File Name'),
  contentType: joiCommon.joiString.label('Mime Type Content'),
  size: joiCommon.joiNumber.label('Size'),
  id: joiCommon.joiNumber.label('Id'),
  email_id: joiCommon.joiNumber.label('Email Id'),
  provider_content_id: joiCommon.joiString.label('Content Id'),
};

export const joiSendmailSchema = {
  from: emailSchema.label('FROM Mail'),
  provider: joiCommon.joiString.label('Provider'),
  to: joiCommon.joiArray.items(emailSchema).label('TO Mails'),
  cc: joiCommon.joiArray.items(emailSchema).label('CC Mails'),
  bcc: joiCommon.joiArray.items(emailSchema).label('BCC Mails'),
  subject: joiCommon.joiString.allow(null, '').label('Subject'),
  html: joiCommon.joiString.allow(null, '').label('HTML'),
  attachments: joiCommon.joiArray.items(attachmentSchema).allow(null, '').label('Attachments'),
  social_account_emails_id: joiCommon.joiNumber.required().label('Conversation Email'),
  id: joiCommon.joiNumber.allow(null, '').label('Id'), // draft_id: joiCommon.joiString.label('Draft Id'),
  references: joiCommon.joiString.allow(null, '').label('References'),
  inReplyTo: joiCommon.joiString.allow(null, '').label('In Reply To'),
  threadId: joiCommon.joiString.allow(null, '').label('Thread id'),
  is_star: joiCommon.joiBoolean.allow(null, '').label('Starred'),
  visibility: Joi.valid('private', 'public').required().label('Visibility'),
  record_id: joiCommon.joiNumber.allow(null).label('Record Id'),
  entity_id: joiCommon.joiNumber.allow(null).label('Entity Id'),
  // added linked_entities for email compose modal link entity
  linked_entities: joiCommon.joiArray
    .items(
      Joi.object({
        entity_id: joiCommon.joiNumber.required(),
        record_id: joiCommon.joiNumber.required(),
      }),
    )
    .allow(null)
    .label('Link Entities'),
};
export const sendMailSchema = Joi.object({
  ...joiSendmailSchema,
  provider: joiSendmailSchema.provider.required(),
  from: joiSendmailSchema.from.required(),
  to: joiSendmailSchema.to.required(),
  html: joiSendmailSchema.html.required(),
  connectEntityName: joiCommon.joiString.allow(null, ''),
  connectEntityId: joiCommon.joiNumber.allow(null, ''),
  emailId: joiCommon.joiNumber.required(),
  conversionId: joiCommon.joiNumber.required(),
  // draft_id: joiCommon.joiString.allow(null, ''),
}).options({
  abortEarly: false,
});

export const replyMailSchema = Joi.object({
  ...joiSendmailSchema,
  provider: joiSendmailSchema.provider.required(),
  from: joiSendmailSchema.from.required(),
  to: joiSendmailSchema.to.required(),
  html: joiSendmailSchema.html.required(),
  connectEntityName: joiCommon.joiString.allow(null, ''),
  connectEntityId: joiCommon.joiNumber.allow(null, ''),
  emailId: joiCommon.joiNumber.required(),
  conversionId: joiCommon.joiNumber.required(),
  threadId: joiCommon.joiString.required(),
}).options({
  abortEarly: false,
});
export const scheduledMailSchema = Joi.object({
  ...joiSendmailSchema,
  provider: joiSendmailSchema.provider.required(),
  from: joiSendmailSchema.from.required(),
  to: joiSendmailSchema.to.required(),
  html: joiSendmailSchema.html.required(),
  connectEntityName: joiCommon.joiString.allow(null, ''),
  connectEntityId: joiCommon.joiNumber.allow(null, ''),
  schedule_after: joiCommon.joiNumber.required(),
  emailId: joiCommon.joiNumber.allow(null, ''),
  conversionId: joiCommon.joiNumber.required(),
}).options({
  abortEarly: false,
});
export const reScheduledMailSchema = Joi.object({
  ...joiSendmailSchema,
  provider: joiSendmailSchema.provider.required(),
  from: joiSendmailSchema.from.required(),
  to: joiSendmailSchema.to.required(),
  html: joiSendmailSchema.html.required(),
  connectEntityName: joiCommon.joiString.allow(null, ''),
  connectEntityId: joiCommon.joiNumber.allow(null, ''),
  schedule_after: joiCommon.joiNumber.required(),
  emailId: joiCommon.joiNumber.required(),
  conversionId: joiCommon.joiNumber.required(),
  is_star: joiCommon.joiBoolean.allow(null),
  schedule_request_date: joiCommon.joiString.allow(null, ''),
}).options({
  abortEarly: false,
});

export const scheduleSendNowMailSchema = Joi.object({
  ...joiSendmailSchema,
  provider: joiSendmailSchema.provider.required(),
  from: joiSendmailSchema.from.required(),
  to: joiSendmailSchema.to.required(),
  html: joiSendmailSchema.html.required(),
  connectEntityName: joiCommon.joiString.allow(null, ''),
  connectEntityId: joiCommon.joiNumber.allow(null, ''),
  conversionId: joiCommon.joiNumber.required(),
  emailId: joiCommon.joiNumber.required(),
  is_star: joiCommon.joiBoolean.allow(null),
  schedule_after: joiCommon.joiNumber.allow(null),
}).options({
  abortEarly: false,
});

export const draftMailGetValidationSchema = Joi.object({
  in_reply_to: joiCommon.joiString.allow(null),
  conversion_id: joiCommon.joiNumber.allow(null),
  id: joiCommon.joiNumber.allow(null),
  social_account_emails_id: joiCommon.joiNumber?.label('Social Account Id')?.required(),
}).options({
  abortEarly: false,
});

export const draftMailValidationSchema = Joi.object({
  ...joiSendmailSchema,
  // draft_id: joiCommon.joiString.allow(null),
  conversionId: joiCommon.joiNumber.allow(null),
  inReplyTo: joiCommon.joiString.allow(null),
  references: joiCommon.joiString.allow(null),
  visibility: Joi.valid('private', 'public').required().label('Visibility'),
  record_id: joiCommon.joiNumber.allow(null).label('Record Id'),
  entity_id: joiCommon.joiNumber.allow(null).label('Entity Id'),
}).options({
  abortEarly: false,
});

export const linkEntityValidationSchema = Joi.object({
  email_conversation_id: joiCommon.joiNumber.allow(null),
  social_account_emails_id: joiCommon.joiNumber.allow(null),
  email_id: joiCommon.joiNumber.allow(null),
  record_id: joiCommon.joiNumber.allow(null).label('Record Id'),
  entity_id: joiCommon.joiNumber.allow(null).label('Entity Id'),
  unLink: joiCommon.joiBoolean.allow(null),
  discardUnlink: joiCommon.joiBoolean.allow(null),
  isDraft: joiCommon.joiBoolean.allow(null),
}).options({
  abortEarly: false,
});

export const discardDraftMailValidationSchema = Joi.object({
  id: joiCommon.joiNumber.required(), // draft_id: joiCommon.joiString.required(),
  email: joiCommon.joiString.required(),
  provider: joiCommon.joiString.required(),
}).options({
  abortEarly: false,
});

export const typeWiseSendValidator = (type: ProcessTypes): RequestHandler => {
  if (type === 'send') {
    return validationMiddleware(sendMailSchema, 'body');
  }
  if (type === 'delay_send') {
    return validationMiddleware(sendMailSchema, 'body');
  }
  if (type === 'rescheduled') {
    return validationMiddleware(reScheduledMailSchema, 'body');
  }
  if (type === 'scheduled') {
    return validationMiddleware(scheduledMailSchema, 'body');
  }
  if (type === 'reply' || type === 'reply_all' || type === 'forward') {
    return validationMiddleware(replyMailSchema, 'body');
  }
  if (type === 'schedule_send') {
    return validationMiddleware(scheduleSendNowMailSchema, 'body');
  }
};

const validationMiddleware = (type: any, value: 'body' | 'query' | 'params' | string = 'body'): RequestHandler => {
  return async (req, res, next) => {
    try {
      cleanObj(req[value]);
      req[value] = await type.validateAsync(req[value]);
      next();
    } catch (e) {
      const error: any = e;
      if (error.details) {
        const errorResponse = errorFilterValidator(error.details);
        return generalResponse(res, errorResponse, 'Something went wrong!', 'error', false, 422);
      }
      return generalResponse(res, null, 'Something went wrong!', 'success', false, 400);
    }
  };
};
const errorFilterValidator = (error: Array<Error>) => {
  const extractedErrors: Array<string> = [];
  error.forEach((err: Error) => extractedErrors.push(err.message));
  const errorResponse = extractedErrors.join(', ');
  return errorResponse;
};

export const starredMailSchema = Joi.object({
  emailId: joiCommon.joiNumber.required(),
  isStar: joiCommon.joiBoolean.required(),
  conversationId: joiCommon.joiNumber.required(),
  social_account_emails_id: joiCommon.joiNumber.required(),
}).options({
  abortEarly: false,
});

export const visibilityMailSchema = Joi.object({
  conversation_id: joiCommon.joiNumber.required(),
  email_id: joiCommon.joiNumber.allow(null),
  visibility: Joi.valid('public', 'private').required().label('Visibility'),
  social_account_emails_id: joiCommon.joiNumber.required(),
});

export const readUnreadMailSchema = Joi.object({
  conversationIds: joiCommon.joiArray
    .items(
      Joi.object({
        id: joiCommon.joiNumber.required(),
        social_account_emails_id: joiCommon.joiNumber.required(),
      }).required(),
    )
    .required(),
  isRead: joiCommon.joiBoolean.required(),
  toast: joiCommon.joiBoolean.allow(null),
  email: Joi.alternatives(joiCommon.joiString.required(), joiCommon?.joiArray.items(joiCommon.joiString)?.required()),
  isFromDetailsPage: joiCommon.joiBoolean,
  // HELLO USER-ONBOARDING-CODE
  is_user_onboarding: joiCommon.joiBoolean,
}).options({
  abortEarly: false,
});

export const trashConversationSchema = Joi.object({
  conversationIds: joiCommon.joiArray
    .items(
      Joi.object({
        id: joiCommon.joiNumber.required(),
        social_account_emails_id: joiCommon.joiNumber.required(),
      }).required(),
    )
    .required(),
  email: Joi.alternatives(joiCommon.joiString.required(), joiCommon?.joiArray.items(joiCommon.joiString)?.required()),
}).options({
  abortEarly: false,
});

export const updateStatusMailSchema = Joi.object({
  emailId: joiCommon.joiArray.items(joiCommon.joiNumber.required())?.allow(null),
  conversationIds: joiCommon.joiArray
    .items(
      Joi.object({
        id: joiCommon.joiNumber.required(),
        social_account_emails_id: joiCommon.joiNumber.required(),
      }).required(),
    )
    .required(),
  action: joiCommon.joiString.required(),
  email: Joi.alternatives(joiCommon.joiString.required(), joiCommon?.joiArray.items(joiCommon.joiString)?.required()),
}).options({
  abortEarly: false,
});

export const undoMailSchema = Joi.object({
  emailId: joiCommon.joiNumber.required(),
  social_account_emails_id: joiCommon.joiNumber.required(),
}).options({
  abortEarly: false,
});

export const undoTrashMailSchema = Joi.object({
  conversationIds: joiCommon.joiArray.items(joiCommon.joiNumber).required(),
  social_account_emails_id: joiCommon.joiArray.items(joiCommon.joiNumber).required(),
}).options({
  abortEarly: false,
});

export const trashMessageSchema = Joi.object({
  messages: joiCommon.joiArray
    .items({ conversationId: joiCommon.joiNumber, emailId: joiCommon.joiNumber, socialAccountId: joiCommon.joiNumber })
    .required(),
  email: joiCommon.joiArray.items(joiCommon.joiString).required(),
}).options({
  abortEarly: false,
});

export const updateStatusMessageSchema = Joi.object({
  messages: joiCommon.joiArray
    .items({ conversationId: joiCommon.joiNumber, emailId: joiCommon.joiNumber, socialAccountId: joiCommon.joiNumber })
    .required(),
  action: joiCommon.joiString.required(),
  email: joiCommon.joiArray.items(joiCommon.joiString).required(),
}).options({
  abortEarly: false,
});



// ** Issue  : Email rewrite is not working when social email is not connected 
// ** Solution  :  email_rewrite_type , organization_id ,  branch_id added by py team for count tokens 
// ** Changes : added email_rewrite_type , organization_id ,  branch_id in rewriteMailValidationSchema becuase this is a required fields and removed social_account_emails_id because no more need to send this field
export const rewriteMailValidationSchema = Joi.object({
  email_body: joiCommon.joiString.allow(null),
  conversation_id: joiCommon.joiNumber,
  action: joiCommon.joiString.required(),
  email_rewrite_type: joiCommon.joiString.required(),
  organization_id: joiCommon.joiNumber.required(),
  branch_id: joiCommon.joiNumber.required(),
  rewrite_email_unique_key: joiCommon.joiString.required(),
  created_at: joiCommon.joiNumber.required(),
}).options({
  abortEarly: false,
});
