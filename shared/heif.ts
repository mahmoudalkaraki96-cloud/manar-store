export function isHeifFile(file:{name:string;type:string}):boolean{
 return /\.(heic|heif)$/i.test(file.name)||/^image\/(?:heic|heif)(?:-sequence)?$/i.test(file.type);
}
