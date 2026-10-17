declare module "citeproc" {
  class Engine {
    constructor(system:{retrieveLocale:(language:string)=>string;retrieveItem:(id:string)=>unknown},style:string,language?:string);
    setOutputFormat(format:string):void;
    updateItems(ids:string[]):void;
    makeBibliography(): [unknown,string[]] | false;
    makeCitationCluster(items:{id:string}[]):string;
  }
  const CSL:{Engine:typeof Engine};
  export default CSL;
}
