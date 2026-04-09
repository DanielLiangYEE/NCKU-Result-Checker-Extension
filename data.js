import { NCKU_DEPTS } from './ncku_data.js';
import { NTU_DEPTS } from './ntu_data.js';
import { NSYSU_DEPTS } from './nsysu_data.js';
import { NCU_DEPTS } from './ncu_data.js';

export const UNIVERSITY_DATA = {
  ntu: {
    name: '台灣大學',
    short: '台大',
    color: '#E53935',
    url: "https://gra108.aca.ntu.edu.tw/regbchk/stu_query.asp?id=15",
    depts: NTU_DEPTS
  },
  ncku: {
    name: '成功大學',
    short: '成大',
    color: '#FBC02D',
    url: "https://nbk.acad.ncku.edu.tw/netcheckin/index.php?c=quall_rwd",
    depts: NCKU_DEPTS
  },
  ncu: {
    name: '中央大學',
    short: '中央',
    color: '#2E7D32',
    url: "https://cis.ncu.edu.tw/ExamRegister/",
    depts: NCU_DEPTS
  },
  nsysu: {
    name: '中山大學',
    short: '中山',
    color: '#1E88E5',
    url: "https://exam2-acad.nsysu.edu.tw/stunew_query/stunew_qry_step1.asp",
    depts: NSYSU_DEPTS
  },
  nccu: {
    name: '政治大學',
    short: '政大',
    color: '#4527A0',
    url: "",
    depts: []
  },
  ccu: {
    name: '中正大學',
    short: '中正',
    color: '#F57C00',
    url: "",
    depts: []
  }
};
