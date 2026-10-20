import {generateCampaignPdfs} from './pdf.js';
import {openPdfDialog} from '../../shared/components/pdf-viewer/index.js';

export function openCampaignPdfDialog(host,campaign,trigger){
 return openPdfDialog(host,{title:campaign.name,generate:()=>generateCampaignPdfs(campaign,{includePreviews:true})},trigger);
}
