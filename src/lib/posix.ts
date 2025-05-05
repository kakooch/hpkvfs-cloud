// src/lib/posix.ts
// POSIX file mode constants (subset)

// File type
export const S_IFMT = 0o170000; // bit mask for the file type bit fields
export const S_IFSOCK = 0o140000; // socket
export const S_IFLNK = 0o120000; // symbolic link
export const S_IFREG = 0o100000; // regular file
export const S_IFBLK = 0o060000; // block device
export const S_IFDIR = 0o040000; // directory
export const S_IFCHR = 0o020000; // character device
export const S_IFIFO = 0o010000; // FIFO

// Permissions
export const S_ISUID = 0o4000; // set-user-ID bit
export const S_ISGID = 0o2000; // set-group-ID bit
export const S_ISVTX = 0o1000; // sticky bit

export const S_IRWXU = 0o0700; // mask for file owner permissions
export const S_IRUSR = 0o0400; // owner has read permission
export const S_IWUSR = 0o0200; // owner has write permission
export const S_IXUSR = 0o0100; // owner has execute permission

export const S_IRWXG = 0o0070; // mask for group permissions
export const S_IRGRP = 0o0040; // group has read permission
export const S_IWGRP = 0o0020; // group has write permission
export const S_IXGRP = 0o0010; // group has execute permission

export const S_IRWXO = 0o0007; // mask for permissions for others (not in group)
export const S_IROTH = 0o0004; // others have read permission
export const S_IWOTH = 0o0002; // others have write permission
export const S_IXOTH = 0o0001; // others have execute permission

