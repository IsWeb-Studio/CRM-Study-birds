export const websiteSections = {
  consultancy: ['consultations', 'consultationSlots', 'events', 'orientation', 'favorites'],
  students: ['students', 'parents', 'agentStudents'],
  admissions: ['applications', 'documents', 'visaCases'],
  finance: ['financials', 'paymentProofs', 'payouts', 'walletEntries','rewardRules'],
  inbox: ['support', 'community', 'communityPosts', 'moderationLog','communitySettings','communitySuspensions','studentOffers','studentOpportunities'],
  reception: ['arrival', 'events'],
  universities: ['universities', 'programs', 'universityAccounts'],
  programs: ['programs'],
  scholarships: ['scholarshipCatalog','scholarships'],
  catalogManagement: ['countries', 'universities', 'programs', 'scholarshipCatalog','studyFields'],
  services: ['services', 'contentServices', 'housing', 'housingListings', 'arrival'],
  partners: ['agencies', 'agents', 'agentStudents', 'verification', 'marketingAssets'],
  content: ['contentServices', 'faqs', 'knowledge', 'testimonials', 'recognitions', 'exhibitions', 'pastEvents', 'upcomingEvent', 'ourStory'],
  hr: ['employees', 'employeeStats'],
  settings: ['siteSettings', 'websiteUsers'],
};
export const websiteSectionRoutes = {
  consultancy: '/consultancy', students: '/students', admissions: '/admissions',
  finance: '/finance', inbox: '/inbox', reception: '/reception', universities: '/universities',
  programs: '/programs', scholarships: '/scholarships', catalogManagement: '/catalog-management',
  services: '/services', partners: '/partners', content: '/content', hr: '/hr', settings: '/settings',
};
export const resourceModules = resource => Object.keys(websiteSections).filter(module => websiteSections[module].includes(resource));
export const websiteResourceRoute = resource => websiteSectionRoutes[resourceModules(resource)[0]] || '/website';
