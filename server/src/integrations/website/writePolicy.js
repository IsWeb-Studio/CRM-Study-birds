import {canDoAction,canOpenModule} from '../../auth.js';
import {resourceModules} from './website.sections.js';
export function requiredAction(resource,operation) {
 if(resource==='students')return ['insurance','equivalency'].includes(operation)?'manageApplicationFollowUp':'createApplication';
 if(resource==='applications')return operation==='delete'?'deleteApplication':operation==='status'?'updateApplicationStatus':operation==='upload'?'uploadDocument':'manageApplicationFollowUp';
 if(resource==='documents')return 'reviewDocument';
 if(resource==='financials')return operation==='delete'?'deleteInvoice':'createInvoice';
 if(['paymentProofs','payouts','walletEntries'].includes(resource))return 'recordPayment';
 if(['consultations','consultationSlots'].includes(resource))return 'manageConsultations';
 if(['services','housing','housingListings','arrival'].includes(resource))return 'manageServices';
 if(['support','communityPosts','communitySettings','communitySuspensions','studentOffers','studentOpportunities'].includes(resource))return 'manageSupport';
 if(resource==='rewardRules')return 'recordPayment';
 // Account roles and employee permissions remain reserved to user administrators.
 if(['employees','websiteUsers','universityAccounts'].includes(resource))return 'manageUsers';
 return 'manageWebsite';
}
export function canWriteResource(user,resource,operation) {
 return resourceModules(resource).some(module=>canOpenModule(user,module)) && (canDoAction(user,'manageWebsite') || canDoAction(user,requiredAction(resource,operation)));
}
